//go:build integration

package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

func testDSN(t *testing.T) string {
	t.Helper()
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	return "postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable"
}

func resetDB(t *testing.T, dsn string) *pgxpool.Pool {
	t.Helper()
	dbDir := filepath.Join(repoRoot(t), "sentinel", "database")
	for i := 0; i < 5; i++ {
		runMigrate(t, dbDir, dsn, "down")
	}
	runMigrate(t, dbDir, dsn, "up")
	pool, err := db.OpenPool(context.Background(), dsn)
	if err != nil {
		t.Fatalf("db connect: %v", err)
	}
	t.Cleanup(pool.Close)
	return pool
}

func repoRoot(t *testing.T) string {
	t.Helper()
	dir, _ := os.Getwd()
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

func runMigrate(t *testing.T, dbDir, dsn, cmd string) {
	t.Helper()
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

func TestAgentEnrollmentFlow(t *testing.T) {
	dsn := testDSN(t)
	ctx := context.Background()
	if pool, err := db.OpenPool(ctx, dsn); err != nil {
		t.Skipf("postgres not available: %v", err)
	} else {
		pool.Close()
	}
	pool := resetDB(t, dsn)
	srv, err := store.CreateServer(context.Background(), pool, "srv1", "host1", "", "")
	if err != nil {
		t.Fatal(err)
	}
	full, _, hash, err := secrets.EnrollmentTokenMaterial()
	if err != nil {
		t.Fatal(err)
	}
	expires := time.Now().UTC().Add(time.Hour)
	_, err = store.CreateEnrollmentToken(context.Background(), pool, srv.ID, hash, "senr_", "test", expires, nil)
	if err != nil {
		t.Fatal(err)
	}

	cfg := config.Config{Port: 0, SessionCookieName: "sid", DatabaseURL: dsn}
	log := slog.Default()
	s := server.New(log, cfg, pool, ratelimit.NewMemory(1000, time.Minute))
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)

	body, _ := json.Marshal(map[string]string{
		"enrollment_token": full,
		"name":             "agent-a",
		"agent_version":    "0.5.0",
	})
	resp, err := http.Post(ts.URL+"/api/v1/agent/enroll", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusCreated {
		t.Fatalf("enroll status %d", resp.StatusCode)
	}
	var enrollResp struct {
		AgentToken string    `json:"agent_token"`
		AgentID    uuid.UUID `json:"agent_id"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&enrollResp); err != nil {
		t.Fatal(err)
	}
	if enrollResp.AgentToken == "" {
		t.Fatal("missing agent token")
	}

	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/agent/heartbeat", bytes.NewReader([]byte(`{"agent_version":"0.5.0"}`)))
	req.Header.Set("Authorization", "Bearer "+enrollResp.AgentToken)
	hb, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	hb.Body.Close()
	if hb.StatusCode != http.StatusOK {
		t.Fatalf("heartbeat status %d", hb.StatusCode)
	}

	evBody, _ := json.Marshal(map[string]any{
		"events": []event.CanonicalEvent{{
			IngestID:   "test-ingest-1",
			OccurredAt: mustParseTime(t, "2026-04-10T22:22:22Z"),
			Source:     "authlog",
			Category:   "auth",
			Severity:   "medium",
			Message:    "SSH failed password attempt",
			Fields:     map[string]any{"user": "root"},
		}},
	})
	req2, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/agent/events", bytes.NewReader(evBody))
	req2.Header.Set("Authorization", "Bearer "+enrollResp.AgentToken)
	req2.Header.Set("Content-Type", "application/json")
	ing, err := http.DefaultClient.Do(req2)
	if err != nil {
		t.Fatal(err)
	}
	ing.Body.Close()
	if ing.StatusCode != http.StatusAccepted {
		t.Fatalf("ingest status %d", ing.StatusCode)
	}
}

func mustParseTime(t *testing.T, s string) time.Time {
	t.Helper()
	tm, err := time.Parse(time.RFC3339, s)
	if err != nil {
		t.Fatal(err)
	}
	return tm
}
