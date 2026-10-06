package seed_test

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"
	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/luca-staudt/Defentrax/sentinel/database/internal/migrate"
	"github.com/luca-staudt/Defentrax/sentinel/database/internal/seed"
)

func testDSN() string {
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	return "postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable"
}

func TestAllowedRequiresExplicitFlags(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("SENTINEL_SEED_DEV", "true")
	if seed.Allowed() {
		t.Fatal("expected seed disallowed in production")
	}

	t.Setenv("APP_ENV", "development")
	t.Setenv("SENTINEL_SEED_DEV", "false")
	if seed.Allowed() {
		t.Fatal("expected seed disallowed without SENTINEL_SEED_DEV")
	}

	t.Setenv("SENTINEL_SEED_DEV", "true")
	if !seed.Allowed() {
		t.Fatal("expected seed allowed with dev flags")
	}
}

func TestRunDevSeedsRoles(t *testing.T) {
	dsn := testDSN()
	ctx := context.Background()

	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	if err := pool.Ping(ctx); err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	defer pool.Close()

	sqlDB, err := sql.Open("pgx", dsn)
	if err != nil {
		t.Fatalf("sql open: %v", err)
	}
	defer sqlDB.Close()
	if err := migrate.Run(sqlDB, "down"); err != nil && !strings.Contains(err.Error(), "no current version") {
		t.Fatalf("migrate down: %v", err)
	}
	if err := migrate.Run(sqlDB, "up"); err != nil {
		t.Fatalf("migrate up: %v", err)
	}

	t.Setenv("APP_ENV", "development")
	t.Setenv("SENTINEL_SEED_DEV", "true")
	t.Setenv("SENTINEL_DEV_ADMIN_PASSWORD", "")

	if err := seed.RunDev(ctx, pool); err != nil {
		t.Fatalf("seed: %v", err)
	}

	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM roles`).Scan(&count); err != nil {
		t.Fatalf("count roles: %v", err)
	}
	if count < 4 {
		t.Fatalf("expected at least 4 roles, got %d", count)
	}
}
