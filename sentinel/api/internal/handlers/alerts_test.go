//go:build integration

package handlers_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/alerts"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/detectionrun"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/realtime"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/detection"
	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

func startAlertTestServer(t *testing.T, pool *pgxpool.Pool, dsn string) (*httptest.Server, *realtime.Hub) {
	t.Helper()
	engine := detection.NewEngine(detection.NewMemoryWindowCounter())
	rulesPath := filepath.Join(repoRoot(t), "sentinel", "rules")
	if err := detectionrun.Bootstrap(context.Background(), slog.Default(), pool, engine, rulesPath); err != nil {
		t.Fatal(err)
	}
	hub := realtime.NewHub(64)
	alertMgr := alerts.NewManagerFromPool(slog.Default(), pool, alerts.NewMemoryCooldownStore(), time.Hour, hub)
	runner := detectionrun.New(slog.Default(), pool, engine, alertMgr, 512)
	t.Cleanup(runner.Close)
	detectSvc := &detectionrun.Service{
		Log: slog.Default(), Pool: pool, Engine: engine, Rules: engine.Rules(), Runner: runner,
	}
	cfg := config.Config{
		Port:               0,
		SessionCookieName:  "sid",
		DatabaseURL:        dsn,
		IngestMaxBatchSize: 100,
		IngestMaxBodyBytes: 1 << 20,
		IngestDBTimeout:    15 * time.Second,
		AlertDedupCooldown: time.Hour,
	}
	sec, _ := base64.StdEncoding.DecodeString("YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=")
	cfg.SessionSecret = sec
	s := server.NewWithOptions(slog.Default(), cfg, pool, ratelimit.NewMemory(1000, time.Minute), ratelimit.NewMemory(1000, time.Minute), ratelimit.NewMemory(1000, time.Minute), server.Options{
		Detection: detectSvc,
		AlertHub:  hub,
	})
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	return ts, hub
}

func loginUser(t *testing.T, tsURL, email, pass string) *http.Cookie {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"email": email, "password": pass})
	res, err := http.Post(tsURL+"/api/v1/auth/login", "application/json", bytes.NewReader(body))
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status %d", res.StatusCode)
	}
	if len(res.Cookies()) == 0 {
		t.Fatal("missing session cookie")
	}
	return res.Cookies()[0]
}

func TestAlertsRBAC(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	ctx := context.Background()

	hash, _ := password.Hash("integration-test-password-long")
	viewerID, err := store.CreateUser(ctx, pool, "viewer-alerts@test.local", hash, "Viewer")
	if err != nil {
		t.Fatal(err)
	}
	_ = store.SetUserRoles(ctx, pool, viewerID, []string{"VIEWER"}, nil)

	ts, _ := startAlertTestServer(t, pool, dsn)
	cookie := loginUser(t, ts.URL, "viewer-alerts@test.local", "integration-test-password-long")

	req, _ := http.NewRequest(http.MethodPatch, ts.URL+"/api/v1/alerts/"+uuid.New().String(), bytes.NewReader([]byte(`{"status":"ACKNOWLEDGED"}`)))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("viewer patch expected 403, got %d", res.StatusCode)
	}
}

func TestAlertLifecycleIntegration(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	ctx := context.Background()

	hash, _ := password.Hash("integration-test-password-long")
	analystID, err := store.CreateUser(ctx, pool, "analyst-alerts@test.local", hash, "Analyst")
	if err != nil {
		t.Fatal(err)
	}
	_ = store.SetUserRoles(ctx, pool, analystID, []string{"SECURITY_ANALYST"}, nil)

	ts, _ := startAlertTestServer(t, pool, dsn)
	token := enrollAgentOnServer(t, ts.URL, pool)

	srcIP := "203.0.113.55"
	now := time.Now().UTC()
	for i := 0; i < 100; i++ {
		status, body := postEvents(t, ts.URL, token, []event.CanonicalEvent{{
			IngestID:   "bf-" + uuid.NewString(),
			OccurredAt: now,
			Source:     "authlog",
			Category:   "auth",
			Severity:   "medium",
			Message:    "Failed password for invalid user",
			Fields: map[string]any{
				"result":  "failed",
				"program": "sshd",
				"src_ip":  srcIP,
			},
		}})
		if status != http.StatusAccepted || body.Accepted != 1 {
			t.Fatalf("ingest %d: status=%d body=%+v", i, status, body)
		}
	}

	deadline := time.Now().Add(15 * time.Second)
	var alertID uuid.UUID
	var eventCount int
	for time.Now().Before(deadline) {
		var n int
		err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM alerts`).Scan(&n)
		if err != nil {
			t.Fatal(err)
		}
		if n == 1 {
			err = pool.QueryRow(ctx, `SELECT id, event_count, source_ip FROM alerts LIMIT 1`).Scan(&alertID, &eventCount, &srcIP)
			if err != nil {
				t.Fatal(err)
			}
			if eventCount >= 100 {
				break
			}
		} else if n > 1 {
			t.Fatalf("expected 1 deduped alert, got %d rows", n)
		}
		time.Sleep(50 * time.Millisecond)
	}
	if alertID == uuid.Nil {
		t.Fatal("timed out waiting for deduped alert")
	}
	if eventCount != 100 {
		t.Fatalf("expected event_count 100, got %d", eventCount)
	}

	cookie := loginUser(t, ts.URL, "analyst-alerts@test.local", "integration-test-password-long")
	patch := func(status string, notes string) int {
		payload := map[string]any{"status": status}
		if notes != "" {
			payload["resolution_notes"] = notes
		}
		b, _ := json.Marshal(payload)
		req, _ := http.NewRequest(http.MethodPatch, ts.URL+"/api/v1/alerts/"+alertID.String(), bytes.NewReader(b))
		req.Header.Set("Content-Type", "application/json")
		req.AddCookie(cookie)
		res, err := http.DefaultClient.Do(req)
		if err != nil {
			t.Fatal(err)
		}
		defer res.Body.Close()
		return res.StatusCode
	}

	if code := patch("INVESTIGATING", ""); code != http.StatusConflict {
		t.Fatalf("skip acknowledge expected 409, got %d", code)
	}
	if code := patch("ACKNOWLEDGED", ""); code != http.StatusOK {
		t.Fatalf("ack expected 200, got %d", code)
	}
	if code := patch("INVESTIGATING", ""); code != http.StatusOK {
		t.Fatalf("investigate expected 200, got %d", code)
	}
	if code := patch("RESOLVED", "Reviewed auth logs; possible automated scanning."); code != http.StatusOK {
		t.Fatalf("resolve expected 200, got %d", code)
	}
	if code := patch("OPEN", ""); code != http.StatusConflict {
		t.Fatalf("reopen expected 409, got %d", code)
	}
}

func TestAlertsWebSocketReceivesPublish(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	ctx := context.Background()

	hash, _ := password.Hash("integration-test-password-long")
	viewerID, err := store.CreateUser(ctx, pool, "ws-viewer@test.local", hash, "Viewer")
	if err != nil {
		t.Fatal(err)
	}
	_ = store.SetUserRoles(ctx, pool, viewerID, []string{"VIEWER"}, nil)

	ts, hub := startAlertTestServer(t, pool, dsn)
	cookie := loginUser(t, ts.URL, "ws-viewer@test.local", "integration-test-password-long")

	header := http.Header{}
	header.Add("Cookie", cookie.Name+"="+cookie.Value)
	wsURL := "ws" + ts.URL[4:] + "/api/v1/ws/alerts"
	conn, resp, err := websocket.DefaultDialer.Dial(wsURL, header)
	if err != nil {
		if resp != nil {
			t.Fatalf("dial ws: %v status=%d", err, resp.StatusCode)
		}
		t.Fatalf("dial ws: %v", err)
	}
	defer conn.Close()

	alertID := uuid.New()
	serverID := uuid.New()
	go func() {
		time.Sleep(100 * time.Millisecond)
		hub.Publish(realtime.AlertEvent{
			Type:     "alert_open",
			AlertID:  alertID,
			ServerID: serverID,
			Severity: "high",
			Title:    "WS integration",
		})
	}()

	conn.SetReadDeadline(time.Now().Add(3 * time.Second))
	_, payload, err := conn.ReadMessage()
	if err != nil {
		t.Fatalf("read ws: %v", err)
	}
	var envelope struct {
		Type string `json:"type"`
		Data struct {
			AlertID uuid.UUID `json:"alert_id"`
			Title   string    `json:"title"`
		} `json:"data"`
	}
	if err := json.Unmarshal(payload, &envelope); err != nil {
		t.Fatalf("decode: %v body=%s", err, payload)
	}
	if envelope.Data.AlertID != alertID || envelope.Data.Title != "WS integration" {
		t.Fatalf("unexpected ws payload: %+v", envelope)
	}
}
