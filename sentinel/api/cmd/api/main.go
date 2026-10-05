package main

import (
	"context"
	"errors"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/logging"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
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
	}

	srv := server.New(log, cfg, pool)

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
