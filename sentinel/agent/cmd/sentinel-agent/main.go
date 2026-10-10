package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	agentapi "github.com/luca-staudt/Defentrax/sentinel/agent/internal/api"
	"github.com/luca-staudt/Defentrax/sentinel/agent/internal/collector/authlog"
	dockercol "github.com/luca-staudt/Defentrax/sentinel/agent/internal/collector/docker"
	"github.com/luca-staudt/Defentrax/sentinel/agent/internal/config"
	"github.com/luca-staudt/Defentrax/sentinel/agent/internal/credentials"
	"github.com/luca-staudt/Defentrax/sentinel/agent/internal/intervention"
	agentlog "github.com/luca-staudt/Defentrax/sentinel/agent/internal/logging"
	"github.com/luca-staudt/Defentrax/sentinel/pkg/event"
)

func main() {
	log := agentlog.NewSafeLogger()
	cfg, err := config.Load()
	if err != nil {
		log.Error("config", "err", err)
		os.Exit(1)
	}
	log.Info("starting Defentrax agent", "config", cfg.String())

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	creds, err := loadOrEnroll(ctx, cfg, log)
	if err != nil {
		log.Error("credentials", "err", err)
		os.Exit(1)
	}
	if cfg.EnrollOnly {
		log.Info("enroll-only complete; credentials saved", "agent_id", creds.AgentID, "path", cfg.CredentialPath)
		return
	}

	client := agentapi.NewClient(cfg.APIBaseURL, cfg.TLSSkipVerify, creds.AgentToken)
	collector := authlog.Collector{
		Path:        cfg.AuthLogPath,
		UseJournald: cfg.UseJournald,
		Host:        cfg.AgentName,
	}
	var fileOffset int64

	var dockerCollector *dockercol.Collector
	if cfg.DockerEnabled {
		dockerCollector = dockercol.NewCollector(dockercol.NewClient(cfg.DockerSocket), cfg.AgentName)
		go func() {
			if err := dockerCollector.Run(ctx); err != nil && ctx.Err() == nil {
				log.Warn("docker collector stopped", "err", err)
			}
		}()
		log.Info("docker monitoring enabled (observe-only)", "socket", cfg.DockerSocket)
	}

	heartbeatTicker := time.NewTicker(cfg.HeartbeatEvery)
	collectTicker := time.NewTicker(cfg.CollectEvery)
	interventionTicker := time.NewTicker(cfg.InterventionEvery)
	defer heartbeatTicker.Stop()
	defer collectTicker.Stop()
	defer interventionTicker.Stop()

	var lastCaps intervention.Capabilities
	var heartbeatDryRun bool
	var heartbeatSeen bool

	sendHeartbeat := func() {
		hb, err := client.Heartbeat(cfg.AgentVersion)
		if err != nil {
			log.Warn("heartbeat failed", "err", err)
			return
		}
		if hb.Intervention != nil {
			lastCaps = intervention.Capabilities{
				Enabled:        hb.Intervention.Enabled,
				Mode:           hb.Intervention.Mode,
				CanPollActions: hb.Intervention.CanPollActions,
				BlockIP:        hb.Intervention.Capabilities["block_ip"],
				KillProcess:    hb.Intervention.Capabilities["kill_process"],
				FirewallRule:   hb.Intervention.Capabilities["firewall_rule"],
				ProtectedCIDRs: hb.Intervention.ProtectedCIDRs,
			}
			heartbeatDryRun = hb.Intervention.DryRun
			heartbeatSeen = true
		}
		log.Debug("heartbeat ok",
			"intervention_mode", lastCaps.Mode,
			"intervention_enabled", lastCaps.Enabled,
			"dry_run", cfg.EffectiveInterventionDryRun(heartbeatDryRun, heartbeatSeen),
		)
	}
	pollInterventions := func() {
		if !lastCaps.CanPollActions {
			return
		}
		actions, err := client.ListPendingInterventions()
		if err != nil {
			log.Warn("poll interventions failed", "err", err)
			return
		}
		dryRun := cfg.EffectiveInterventionDryRun(heartbeatDryRun, heartbeatSeen)
		for _, a := range actions {
			res := intervention.Execute(ctx, lastCaps, intervention.Action{
				ID:         a.ID,
				ActionType: a.ActionType,
				Payload:    a.Payload,
			}, dryRun)
			if err := client.ReportInterventionResult(a.ID, res.Success, res.Result, res.Error); err != nil {
				log.Warn("report intervention result failed", "err", err, "action_id", a.ID)
				continue
			}
			log.Info("intervention processed", "action_id", a.ID, "type", a.ActionType, "success", res.Success, "dry_run", dryRun)
		}
	}
	ingest := func(events []event.CanonicalEvent, source string) {
		if len(events) == 0 {
			return
		}
		if err := client.IngestEvents(events); err != nil {
			log.Warn("ingest events", "err", err, "count", len(events), "source", source)
			return
		}
		log.Info("ingested events", "count", len(events), "source", source)
	}
	sendHeartbeat()

	for {
		select {
		case <-ctx.Done():
			log.Info("shutdown")
			return
		case <-heartbeatTicker.C:
			sendHeartbeat()
		case <-interventionTicker.C:
			pollInterventions()
		case <-collectTicker.C:
			events, off, err := collector.CollectTail(fileOffset)
			if err != nil {
				log.Warn("collect auth events", "err", err)
			} else {
				if !cfg.UseJournald {
					fileOffset = off
				}
				ingest(events, "authlog")
			}
			if dockerCollector != nil {
				ingest(dockerCollector.Drain(), "docker")
			}
		}
	}
}

func loadOrEnroll(ctx context.Context, cfg config.Config, log *slog.Logger) (credentials.StoredCredentials, error) {
	creds, err := credentials.Load(cfg.CredentialPath)
	if err == nil {
		return creds, nil
	}
	if cfg.EnrollmentToken != "" {
		client := agentapi.NewClient(cfg.APIBaseURL, cfg.TLSSkipVerify, "")
		resp, err := client.Enroll(cfg.EnrollmentToken, cfg.AgentName, cfg.AgentVersion)
		if err != nil {
			return credentials.StoredCredentials{}, err
		}
		creds = credentials.StoredCredentials{
			AgentID:     resp.AgentID,
			ServerID:    resp.ServerID,
			AgentToken:  resp.AgentToken,
			TokenPrefix: resp.TokenPrefix,
		}
		if err := credentials.Save(cfg.CredentialPath, creds); err != nil {
			return credentials.StoredCredentials{}, err
		}
		log.Info("enrolled", "agent_id", creds.AgentID, "token_prefix", creds.TokenPrefix)
		return creds, nil
	}

	// Panel-first compose flow: wait for credentials written by a one-shot enroll into the volume.
	log.Warn("no credentials yet; waiting for panel one-shot enroll into credential volume",
		"path", cfg.CredentialPath,
	)
	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			return credentials.StoredCredentials{}, ctx.Err()
		case <-ticker.C:
			creds, err := credentials.Load(cfg.CredentialPath)
			if err == nil {
				log.Info("credentials appeared on disk", "agent_id", creds.AgentID)
				return creds, nil
			}
			log.Warn("still waiting for credentials (issue token in panel, then one-shot compose enroll)",
				"path", cfg.CredentialPath,
			)
		}
	}
}
