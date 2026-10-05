package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/bootstrap"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/detectionrun"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/logging"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
	"github.com/luca-staudt/Sentinel/sentinel/detection"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		_, _ = os.Stderr.WriteString("config: " + err.Error() + "\n")
		os.Exit(1)
	}

	log := logging.New(cfg.LogLevel)
	log.Info("sentinel api starting", "env", cfg.Env, "port", cfg.Port)

	ctx := context.Background()
	var pool *pgxpool.Pool
	if cfg.DatabaseURL != "" {
		p, err := db.OpenPool(ctx, cfg.DatabaseURL)
		if err != nil {
			log.Error("database connection failed", "error", err)
			os.Exit(1)
		}
		defer p.Close()
		pool = p
		log.Info("database connected")

		if created, err := bootstrap.EnsureFirstAdmin(ctx, pool); err != nil {
			log.Error("bootstrap admin failed", "error", err)
			os.Exit(1)
		} else if created {
			log.Info("bootstrap admin user created from environment")
		}
	}

	loginLimiter, closeLogin, err := ratelimit.NewFromConfig(cfg.RedisURL, cfg.LoginRateLimitMax, cfg.LoginRateLimitWindow, "sentinel:login:")
	if err != nil {
		log.Error("rate limiter init failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = closeLogin() }()

	ingestLimiter, closeIngest, err := ratelimit.NewFromConfig(cfg.RedisURL, cfg.IngestRateLimitMax, cfg.IngestRateLimitWindow, "sentinel:ingest:")
	if err != nil {
		log.Error("ingest rate limiter init failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = closeIngest() }()
	if cfg.RedisURL == "" {
		log.Info("rate limiting uses in-memory store (set REDIS_URL for multi-instance)")
	}

	windowCounter, closeWindow, err := detection.NewWindowCounterFromRedisURL(cfg.RedisURL)
	if err != nil {
		log.Error("detection window counter init failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = closeWindow() }()

	var detectSvc *detectionrun.Service
	opts := server.Options{}
	if pool != nil {
		engine := detection.NewEngine(windowCounter)
		rulesPath := rulesDir()
		if err := detectionrun.Bootstrap(ctx, log, pool, engine, rulesPath); err != nil {
			log.Error("detection bootstrap failed", "error", err, "rules_path", rulesPath)
			os.Exit(1)
		}
		rules := engine.Rules()
		runner := detectionrun.New(log, pool, engine, 1024)
		defer runner.Close()
		detectSvc = &detectionrun.Service{
			Log:    log,
			Pool:   pool,
			Engine: engine,
			Rules:  rules,
			Runner: runner,
		}
		opts.Detection = detectSvc
	}

	srv := server.NewWithOptions(log, cfg, pool, loginLimiter, ingestLimiter, opts)

	errCh := make(chan error, 1)
	go func() {
		if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case err := <-errCh:
		log.Error("server failed", "error", err)
		os.Exit(1)
	case sig := <-sigCh:
		log.Info("signal received", "signal", sig.String())
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		log.Error("shutdown failed", "error", err)
		os.Exit(1)
	}
	log.Info("sentinel api stopped")
}

func rulesDir() string {
	if v := os.Getenv("SENTINEL_RULES_PATH"); v != "" {
		return v
	}
	// Default: repo-relative path when running from sentinel/api or repo root.
	candidates := []string{
		filepath.Join("..", "rules"),
		filepath.Join("sentinel", "rules"),
		"rules",
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c
		}
	}
	return filepath.Join("..", "rules")
}
