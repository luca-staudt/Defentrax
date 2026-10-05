package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/alerts"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/bootstrap"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/detectionrun"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/logging"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/notify"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/pluginruntime"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/realtime"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
	"github.com/luca-staudt/Sentinel/sentinel/detection"
	"github.com/luca-staudt/Sentinel/sentinel/plugins/loader"

	_ "github.com/luca-staudt/Sentinel/sentinel/plugins/examples/echo-parser" // register example plugin factory
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

	enrollLimiter, closeEnroll, err := ratelimit.NewFromConfig(cfg.RedisURL, cfg.EnrollRateLimitMax, cfg.EnrollRateLimitWindow, "sentinel:enroll:")
	if err != nil {
		log.Error("enroll rate limiter init failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = closeEnroll() }()
	if cfg.RedisURL == "" {
		log.Info("rate limiting uses in-memory store (set REDIS_URL for multi-instance)")
	}

	windowCounter, closeWindow, err := detection.NewWindowCounterFromRedisURL(cfg.RedisURL)
	if err != nil {
		log.Error("detection window counter init failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = closeWindow() }()

	alertCooldown, closeAlertCooldown, err := alerts.NewCooldownFromRedisURL(cfg.RedisURL)
	if err != nil {
		log.Error("alert dedup store init failed", "error", err)
		os.Exit(1)
	}
	defer func() { _ = closeAlertCooldown() }()

	alertHub := realtime.NewHub(256)

	var notifier *notify.Dispatcher
	if pool != nil && len(cfg.SecretsEncryptionKey) == 32 {
		notifier = notify.NewDispatcher(log, pool, cfg.SecretsEncryptionKey)
		notifier.MaxAttempts = cfg.NotifyMaxAttempts
		notifier.BaseBackoff = cfg.NotifyBaseBackoff
		notifier.MaxBackoff = cfg.NotifyMaxBackoff
		defer notifier.Close()
		go runNotificationRetrier(log, notifier)
	} else if pool != nil {
		log.Warn("notification dispatcher disabled: set SECRETS_ENCRYPTION_KEY or TOTP_ENCRYPTION_KEY (32-byte base64)")
	}

	var detectSvc *detectionrun.Service
	opts := server.Options{
		AlertHub:   alertHub,
		Notifier:   notifier,
		SecretsKey: cfg.SecretsEncryptionKey,
	}
	if pool != nil {
		engine := detection.NewEngine(windowCounter)
		rulesPath := rulesDir()
		if err := detectionrun.Bootstrap(ctx, log, pool, engine, rulesPath); err != nil {
			log.Error("detection bootstrap failed", "error", err, "rules_path", rulesPath)
			os.Exit(1)
		}
		rules := engine.Rules()
		alertMgr := alerts.NewManagerFromPool(log, pool, alertCooldown, cfg.AlertDedupCooldown, alertHub)
		alertMgr.Notifier = notifier
		runner := detectionrun.New(log, pool, engine, alertMgr, 1024)
		defer runner.Close()
		detectSvc = &detectionrun.Service{
			Log:    log,
			Pool:   pool,
			Engine: engine,
			Rules:  rules,
			Runner: runner,
		}
		opts.Detection = detectSvc

		pluginDir := cfg.PluginDir
		if pluginDir == "" {
			pluginDir = pluginsDir()
		}
		pubKey, err := loader.ParsePublicKey(cfg.PluginTrustedPublicKey)
		if err != nil {
			log.Error("plugin public key invalid", "error", err)
			os.Exit(1)
		}
		pol := loader.Policy{
			RootDir:          pluginDir,
			Allowlist:        loader.ParseAllowlist(cfg.PluginAllowlist),
			RequireSignature: cfg.PluginRequireSignature,
			TrustedPublicKey: pubKey,
		}
		pluginRT, err := pluginruntime.Bootstrap(ctx, log, pool, pol)
		if err != nil {
			log.Error("plugin runtime bootstrap failed", "error", err, "plugin_dir", pluginDir)
			os.Exit(1)
		}
		defer pluginRT.Close(context.Background())
		opts.Plugins = pluginRT
		log.Info("plugin runtime ready", "plugin_dir", pluginDir, "allowlist", cfg.PluginAllowlist)
	}

	srv := server.NewWithOptions(log, cfg, pool, loginLimiter, ingestLimiter, enrollLimiter, opts)

	if cfg.TLSCertFile != "" {
		log.Info("TLS enabled", "cert_file", cfg.TLSCertFile)
	} else if cfg.Env == "production" {
		log.Warn("API listening on plain HTTP; terminate TLS at a reverse proxy or set API_TLS_CERT_FILE/API_TLS_KEY_FILE")
	}

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

func pluginsDir() string {
	candidates := []string{
		filepath.Join("..", "plugins", "examples"),
		filepath.Join("sentinel", "plugins", "examples"),
		filepath.Join("plugins", "examples"),
	}
	for _, c := range candidates {
		if st, err := os.Stat(c); err == nil && st.IsDir() {
			return c
		}
	}
	return filepath.Join("..", "plugins", "examples")
}

func runNotificationRetrier(log *slog.Logger, d *notify.Dispatcher) {
	ticker := time.NewTicker(15 * time.Second)
	defer ticker.Stop()
	for range ticker.C {
		ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
		n := d.ProcessPending(ctx, 50)
		cancel()
		if n > 0 {
			log.Info("notification retrier processed deliveries", "count", n)
		}
	}
}
