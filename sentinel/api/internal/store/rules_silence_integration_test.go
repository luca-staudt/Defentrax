package store

import (
	"context"
	"os"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

func TestListRulesWithSilenceWindow(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set")
	}
	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(pool.Close)

	row, err := InsertCustomRule(ctx, pool, RuleUpsert{
		YAMLID:      "custom.repro",
		Name:        "Repro rule " + uuid.NewString(),
		Description: "repro",
		Severity:    "medium",
		Version:     1,
		Definition:  []byte(`{"id":"custom.repro","origin":"custom","name":"repro"}`),
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM rules WHERE id = $1`, row.ID)
	})

	until := time.Now().UTC().Add(2 * time.Hour)
	if err := UpsertSilence(ctx, pool, "rule", row.ID, until, nil); err != nil {
		t.Fatalf("upsert silence: %v", err)
	}
	t.Cleanup(func() {
		_ = DeleteSilence(context.Background(), pool, "rule", row.ID)
	})

	rules, err := ListRules(ctx, pool)
	if err != nil {
		t.Fatalf("list rules: %v", err)
	}
	found := false
	for _, item := range rules {
		if item.ID == row.ID {
			found = true
		}
	}
	if !found {
		t.Fatal("inserted rule missing from list")
	}

	silences, err := ListSilences(ctx, pool, "rule")
	if err != nil {
		t.Fatalf("list silences: %v", err)
	}
	got, ok := silences[row.ID]
	if !ok {
		t.Fatalf("silence missing for %s, map=%v", row.ID, silences)
	}
	if got.Before(time.Now()) {
		t.Fatalf("silence until in the past: %s", got)
	}

	active, err := SilenceActive(ctx, pool, row.ID, uuid.New())
	if err != nil {
		t.Fatalf("silence active: %v", err)
	}
	if !active {
		t.Fatal("expected active rule silence")
	}

	stats, err := DashboardStatsQuery(ctx, pool)
	if err != nil {
		t.Fatalf("dashboard: %v", err)
	}
	if stats.HostsSilentMinutes != 15 {
		t.Fatalf("silent minutes = %d", stats.HostsSilentMinutes)
	}

	signals, err := ListServerSignals(ctx, pool, time.Now().UTC().Add(-SilentHostAfter))
	if err != nil {
		t.Fatalf("server signals: %v", err)
	}
	t.Logf("rules=%d silences=%d servers=%d", len(rules), len(silences), len(signals))

	var serverID uuid.UUID
	if err := pool.QueryRow(ctx, `INSERT INTO servers (name, hostname) VALUES ($1, 'scan.local') RETURNING id`, "scan-"+uuid.NewString()).Scan(&serverID); err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() {
		_, _ = pool.Exec(context.Background(), `DELETE FROM servers WHERE id = $1`, serverID)
	})
	if _, err := pool.Exec(ctx, `INSERT INTO agents (server_id, name, status, agent_version, last_heartbeat_at) VALUES ($1, 'agent', 'active', '0', now() - interval '1 hour')`, serverID); err != nil {
		t.Fatal(err)
	}
	signals, err = ListServerSignals(ctx, pool, time.Now().UTC().Add(-SilentHostAfter))
	if err != nil {
		t.Fatalf("signals with agent: %v", err)
	}
	var matched *ServerSignal
	for i := range signals {
		if signals[i].ID == serverID {
			matched = &signals[i]
		}
	}
	if matched == nil || matched.AgentCount != 1 || !matched.Silent {
		t.Fatalf("signal = %#v", matched)
	}
}
