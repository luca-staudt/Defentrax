//go:build integration

// Package testutil holds shared helpers for PostgreSQL-backed integration tests.
package testutil

import (
	"context"
	"encoding/base64"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
)

const defaultTestDSN = "postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable"

// TestDSN returns TEST_DATABASE_URL or the local migration-test default.
func TestDSN(t *testing.T) string {
	t.Helper()
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	return defaultTestDSN
}

// SkipUnlessPostgres skips the test when the database is unreachable.
func SkipUnlessPostgres(t *testing.T, dsn string) {
	t.Helper()
	ctx := context.Background()
	pool, err := db.OpenPool(ctx, dsn)
	if err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	pool.Close()
}

// RepoRoot walks up from the working directory to the repository root (Makefile present).
func RepoRoot(t *testing.T) string {
	t.Helper()
	dir, err := os.Getwd()
	if err != nil {
		t.Fatal(err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "Makefile")); err == nil {
			return dir
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			t.Fatal("repo root not found")
		}
		dir = parent
	}
}

// RunDBMigrate runs goose up/down via the database module CLI.
func RunDBMigrate(t *testing.T, dsn, cmd string) {
	t.Helper()
	dbDir := filepath.Join(RepoRoot(t), "sentinel", "database")
	c := exec.Command("go", "run", "./cmd/migrate", cmd)
	c.Dir = dbDir
	c.Env = append(os.Environ(), "DATABASE_URL="+dsn)
	out, err := c.CombinedOutput()
	if err != nil && cmd == "down" {
		return
	}
	if err != nil {
		t.Fatalf("migrate %s: %v\n%s", cmd, err, out)
	}
}

// ResetAndMigrate tears down migrations and applies them fresh; returns a connected pool.
func ResetAndMigrate(t *testing.T, dsn string, downPasses int) *pgxpool.Pool {
	t.Helper()
	if downPasses < 1 {
		downPasses = 12
	}
	for i := 0; i < downPasses; i++ {
		RunDBMigrate(t, dsn, "down")
	}
	RunDBMigrate(t, dsn, "up")
	pool, err := db.OpenPool(context.Background(), dsn)
	if err != nil {
		t.Fatalf("db connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

// TestConfig returns API config suitable for httptest servers in integration tests.
func TestConfig(dsn string) config.Config {
	sec, _ := base64.StdEncoding.DecodeString("YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=")
	totpKey, _ := base64.StdEncoding.DecodeString("YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI=")
	return config.Config{
		Env:                  "development",
		Port:                 8080,
		DatabaseURL:          dsn,
		SessionSecret:        sec,
		SessionCookieName:    "sentinel_session",
		SessionTTL:           24 * time.Hour,
		CookieSecure:         false,
		TOTPEncryptionKey:    totpKey,
		LoginRateLimitMax:    100,
		LoginRateLimitWindow: time.Minute,
		IngestMaxBatchSize:   100,
		IngestMaxBodyBytes:   1 << 20,
		IngestDBTimeout:      15 * time.Second,
		AlertDedupCooldown:   time.Hour,
	}
}
