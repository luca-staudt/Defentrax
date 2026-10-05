package main

import (
	"context"
	"os"
	"os/signal"
	"syscall"
	"time"

	agentapi "github.com/luca-staudt/Sentinel/sentinel/agent/internal/api"
	"github.com/luca-staudt/Sentinel/sentinel/agent/internal/collector/authlog"
	"github.com/luca-staudt/Sentinel/sentinel/agent/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/agent/internal/credentials"
	agentlog "github.com/luca-staudt/Sentinel/sentinel/agent/internal/logging"
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

	heartbeatTicker := time.NewTicker(cfg.HeartbeatEvery)
	collectTicker := time.NewTicker(cfg.CollectEvery)
	defer heartbeatTicker.Stop()
	defer collectTicker.Stop()

	sendHeartbeat := func() {
		if err := client.Heartbeat(cfg.AgentVersion); err != nil {
			log.Warn("heartbeat failed", "err", err)
			return
		}
		log.Debug("heartbeat ok")
	}
	sendHeartbeat()

	for {
		select {
		case <-ctx.Done():
			log.Info("shutdown")
			return
		case <-heartbeatTicker.C:
			sendHeartbeat()
		case <-collectTicker.C:
			events, off, err := collector.CollectTail(fileOffset)
			if err != nil {
				log.Warn("collect auth events", "err", err)
				continue
			}
			if !cfg.UseJournald {
				fileOffset = off
			}
			if len(events) == 0 {
				continue
			}
			if err := client.IngestEvents(events); err != nil {
				log.Warn("ingest events", "err", err, "count", len(events))
				continue
			}
			log.Info("ingested events", "count", len(events))
		}
	}
}
