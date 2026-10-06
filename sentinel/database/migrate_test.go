package database_test

import (
	"context"
	"database/sql"
	"os"
	"strings"
	"testing"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"

	"github.com/luca-staudt/Defentrax/sentinel/database/internal/migrate"
)

func testDatabaseURL(t *testing.T) string {
	t.Helper()
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	return "postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable"
}

func openTestDB(t *testing.T) *sql.DB {
	t.Helper()
	db, err := sql.Open("pgx", testDatabaseURL(t))
	if err != nil {
		t.Fatalf("open: %v", err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	return db
}

func migrateDownAllowEmpty(t *testing.T, db *sql.DB) {
	t.Helper()
	if err := migrate.Run(db, "down"); err != nil {
		if strings.Contains(err.Error(), "no current version") {
			return
		}
		t.Fatalf("down: %v", err)
	}
}

func TestMigrateUpDown(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()

	migrateDownAllowEmpty(t, db)
	if err := migrate.Run(db, "up"); err != nil {
		t.Fatalf("up: %v", err)
	}
	if err := migrate.Run(db, "down"); err != nil {
		t.Fatalf("down: %v", err)
	}
	if err := migrate.Run(db, "up"); err != nil {
		t.Fatalf("up again: %v", err)
	}
}

func TestEventsIngestUniqueConstraint(t *testing.T) {
	db := openTestDB(t)
	defer db.Close()

	migrateDownAllowEmpty(t, db)
	if err := migrate.Run(db, "up"); err != nil {
		t.Fatalf("up: %v", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	var serverID, agentID string
	err := db.QueryRowContext(ctx, `
		INSERT INTO servers (name, hostname) VALUES ('test-srv', 'test.local') RETURNING id
	`).Scan(&serverID)
	if err != nil {
		t.Fatalf("insert server: %v", err)
	}
	err = db.QueryRowContext(ctx, `
		INSERT INTO agents (server_id, status) VALUES ($1, 'active') RETURNING id
	`, serverID).Scan(&agentID)
	if err != nil {
		t.Fatalf("insert agent: %v", err)
	}

	_, err = db.ExecContext(ctx, `
		INSERT INTO events (agent_id, server_id, occurred_at, source, message, ingest_id)
		VALUES ($1, $2, now(), 'authlog', 'first', 'ingest-1')
	`, agentID, serverID)
	if err != nil {
		t.Fatalf("first event: %v", err)
	}
	_, err = db.ExecContext(ctx, `
		INSERT INTO events (agent_id, server_id, occurred_at, source, message, ingest_id)
		VALUES ($1, $2, now(), 'authlog', 'dup', 'ingest-1')
	`, agentID, serverID)
	if err == nil {
		t.Fatal("expected unique violation on (agent_id, ingest_id)")
	}
}
