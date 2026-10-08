package handlers

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/detectionrun"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
	"github.com/luca-staudt/Defentrax/sentinel/detection"
)

func TestRulesListHTTPAfterBootstrap(t *testing.T) {
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

	engine := detection.NewEngine(nil)
	rulesDir := filepath.Join("..", "..", "..", "rules")
	if err := detectionrun.Bootstrap(ctx, slog.New(slog.NewTextHandler(io.Discard, nil)), pool, engine, rulesDir); err != nil {
		t.Fatalf("bootstrap: %v", err)
	}

	h := &RulesHandler{Pool: pool}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/rules", nil)
	rec := httptest.NewRecorder()
	h.List(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("status %d body %s", rec.Code, rec.Body.String())
	}
	var body struct {
		Rules []ruleResponse `json:"rules"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode: %v body=%s", err, rec.Body.String())
	}
	if len(body.Rules) == 0 {
		t.Fatal("expected bundled rules")
	}
	for _, rule := range body.Rules {
		if rule.ID.String() == "" || rule.Name == "" || len(rule.Definition) == 0 {
			t.Fatalf("incomplete rule %#v", rule)
		}
		if !json.Valid(rule.Definition) {
			t.Fatalf("definition is not json for %s: %s", rule.Name, rule.Definition)
		}
	}

	id := body.Rules[0].ID
	getReq := httptest.NewRequest(http.MethodGet, "/api/v1/rules/"+id.String(), nil)
	getRec := httptest.NewRecorder()
	h.Get(getRec, getReq, id)
	if getRec.Code != http.StatusOK {
		t.Fatalf("get status %d body %s", getRec.Code, getRec.Body.String())
	}

	if _, err := store.ListServerSignals(ctx, pool, time.Now().UTC().Add(-store.SilentHostAfter)); err != nil {
		t.Fatalf("signals: %v", err)
	}

	until := time.Now().UTC().Add(2 * time.Hour).Truncate(time.Second)
	if err := store.UpsertSilence(ctx, pool, "rule", id, until, nil); err != nil {
		t.Fatalf("upsert silence: %v", err)
	}
	t.Cleanup(func() {
		_ = store.DeleteSilence(context.Background(), pool, "rule", id)
	})
	again := httptest.NewRecorder()
	h.List(again, httptest.NewRequest(http.MethodGet, "/api/v1/rules", nil))
	if again.Code != http.StatusOK {
		t.Fatalf("silenced list status %d body %s", again.Code, again.Body.String())
	}
	var silenced struct {
		Rules []ruleResponse `json:"rules"`
	}
	if err := json.Unmarshal(again.Body.Bytes(), &silenced); err != nil {
		t.Fatal(err)
	}
	var matched *ruleResponse
	for i := range silenced.Rules {
		if silenced.Rules[i].ID == id {
			matched = &silenced.Rules[i]
		}
	}
	if matched == nil || matched.SilencedUntil == nil || *matched.SilencedUntil == "" {
		t.Fatalf("expected silenced_until on %s, got %#v", id, matched)
	}
	t.Logf("listed %d rules, silence=%s", len(body.Rules), *matched.SilencedUntil)
}
