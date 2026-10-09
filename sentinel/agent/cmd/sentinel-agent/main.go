package main

import (
	"context"
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
	log.Info("starting sentinel agent", "config", cfg.String())

	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	creds, err := credentials.Load(cfg.CredentialPath)
	if err != nil {
		if cfg.EnrollmentToken == "" {
			log.Error("no credentials and SENTINEL_ENROLLMENT_TOKEN not set")
			os.Exit(1)
		}
		client := agentapi.NewClient(cfg.APIBaseURL, cfg.TLSSkipVerify, "")
		resp, err := client.Enroll(cfg.EnrollmentToken, cfg.AgentName, cfg.AgentVersion)
		if err != nil {
			log.Error("enrollment failed", "err", err)
			os.Exit(1)
		}
		creds = credentials.StoredCredentials{
			AgentID:     resp.AgentID,
			ServerID:    resp.ServerID,
			AgentToken:  resp.AgentToken,
			TokenPrefix: resp.TokenPrefix,
		}
		if err := credentials.Save(cfg.CredentialPath, creds); err != nil {
			log.Error("save credentials", "err", err)
			os.Exit(1)
		}
		log.Info("enrolled", "agent_id", creds.AgentID, "token_prefix", creds.TokenPrefix)
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
		}
		log.Debug("heartbeat ok", "intervention_mode", lastCaps.Mode, "intervention_enabled", lastCaps.Enabled)
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
		for _, a := range actions {
			res := intervention.Execute(ctx, lastCaps, intervention.Action{
				ID:         a.ID,
				ActionType: a.ActionType,
				Payload:    a.Payload,
			}, cfg.InterventionDryRun)
			if err := client.ReportInterventionResult(a.ID, res.Success, res.Result, res.Error); err != nil {
				log.Warn("report intervention result failed", "err", err, "action_id", a.ID)
				continue
			}
			log.Info("intervention processed", "action_id", a.ID, "type", a.ActionType, "success", res.Success, "dry_run", cfg.InterventionDryRun)
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
