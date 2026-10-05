//go:build integration

package handlers_test

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/notify"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

func TestNotificationChannelTestEndpoint(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	createRoleUser(t, pool, "ops-testch@test.local", "OPERATOR")

	mock := &mockHTTP{}
	disp := notify.NewDispatcher(slog.Default(), pool, secretsKey())
	disp.Async = false
	disp.Webhooks = &notify.WebhookSender{Client: mock}
	t.Cleanup(disp.Close)

	ts := startNotifyTestServer(t, pool, dsn, disp)
	cookie := loginUser(t, ts.URL, "ops-testch@test.local", "integration-test-password-long")

	webhook := "https://discord.com/api/webhooks/999/secret-token-xyz"
	body, _ := json.Marshal(map[string]any{
		"name":         "test-discord",
		"channel_type": "discord",
		"config":       map[string]any{},
		"secrets":      map[string]any{"webhook_url": webhook},
	})
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/notification-channels", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer res.Body.Close()
	raw, _ := io.ReadAll(res.Body)
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create status=%d body=%s", res.StatusCode, raw)
	}
	var created struct {
		ID uuid.UUID `json:"id"`
	}
	if err := json.Unmarshal(raw, &created); err != nil {
		t.Fatal(err)
	}

	testReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/notification-channels/"+created.ID.String()+"/test", nil)
	testReq.AddCookie(cookie)
	testRes, err := http.DefaultClient.Do(testReq)
	if err != nil {
		t.Fatal(err)
	}
	defer testRes.Body.Close()
	testRaw, _ := io.ReadAll(testRes.Body)
	if testRes.StatusCode != http.StatusOK {
		t.Fatalf("test status=%d body=%s", testRes.StatusCode, testRaw)
	}
	if strings.Contains(string(testRaw), "secret-token-xyz") || strings.Contains(string(testRaw), webhook) {
		t.Fatalf("secret leaked in test response: %s", testRaw)
	}
	if mock.calls < 1 {
		t.Fatal("expected webhook to be called")
	}

	// Failure path: mock returns 500
	mock.failUntil = mock.calls + 5
	failReq, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/notification-channels/"+created.ID.String()+"/test", nil)
	failReq.AddCookie(cookie)
	failRes, err := http.DefaultClient.Do(failReq)
	if err != nil {
		t.Fatal(err)
	}
	defer failRes.Body.Close()
	failRaw, _ := io.ReadAll(failRes.Body)
	if failRes.StatusCode != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d body=%s", failRes.StatusCode, failRaw)
	}
	if strings.Contains(string(failRaw), "secret-token-xyz") {
		t.Fatalf("secret leaked in error: %s", failRaw)
	}
	var errBody struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}
	if err := json.Unmarshal(failRaw, &errBody); err != nil {
		t.Fatal(err)
	}
	if errBody.Code != "delivery_failed" || errBody.Message == "" {
		t.Fatalf("unexpected error envelope: %+v", errBody)
	}
}

func TestAuditLogsListAndGet(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	createRoleUser(t, pool, "admin-audit@test.local", "ADMIN")
	createRoleUser(t, pool, "viewer-audit@test.local", "VIEWER")

	disp := notify.NewDispatcher(slog.Default(), pool, secretsKey())
	disp.Async = false
	t.Cleanup(disp.Close)
	ts := startNotifyTestServer(t, pool, dsn, disp)

	adminCookie := loginUser(t, ts.URL, "admin-audit@test.local", "integration-test-password-long")
	viewerCookie := loginUser(t, ts.URL, "viewer-audit@test.local", "integration-test-password-long")

	actorID := uuid.Nil
	_ = pool.QueryRow(context.Background(), `SELECT id FROM users WHERE email = $1`, "admin-audit@test.local").Scan(&actorID)
	if actorID == uuid.Nil {
		t.Fatal("admin user missing")
	}
	err := store.Audit(context.Background(), pool, &actorID, "user", "server.create", "server", nil, map[string]any{
		"name": "edge-01",
	}, nil, "integration-test-agent")
	if err != nil {
		t.Fatal(err)
	}

	// VIEWER forbidden
	denyReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/audit-logs", nil)
	denyReq.AddCookie(viewerCookie)
	denyRes, err := http.DefaultClient.Do(denyReq)
	if err != nil {
		t.Fatal(err)
	}
	denyRes.Body.Close()
	if denyRes.StatusCode != http.StatusForbidden && denyRes.StatusCode != http.StatusUnauthorized {
		t.Fatalf("viewer expected forbidden, got %d", denyRes.StatusCode)
	}

	listReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/audit-logs?action=server.create&limit=10", nil)
	listReq.AddCookie(adminCookie)
	listRes, err := http.DefaultClient.Do(listReq)
	if err != nil {
		t.Fatal(err)
	}
	defer listRes.Body.Close()
	listRaw, _ := io.ReadAll(listRes.Body)
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("list status=%d body=%s", listRes.StatusCode, listRaw)
	}
	var page struct {
		AuditLogs []struct {
			ID         uuid.UUID `json:"id"`
			Action     string    `json:"action"`
			ActorEmail string    `json:"actor_email"`
			UserAgent  string    `json:"user_agent"`
		} `json:"audit_logs"`
		Total int `json:"total"`
	}
	if err := json.Unmarshal(listRaw, &page); err != nil {
		t.Fatal(err)
	}
	if page.Total < 1 || len(page.AuditLogs) < 1 {
		t.Fatalf("expected audit rows, got %+v", page)
	}
	found := false
	var id uuid.UUID
	for _, row := range page.AuditLogs {
		if row.Action == "server.create" && row.ActorEmail == "admin-audit@test.local" {
			found = true
			id = row.ID
			if row.UserAgent != "integration-test-agent" {
				t.Fatalf("user_agent=%q", row.UserAgent)
			}
			break
		}
	}
	if !found {
		t.Fatalf("server.create row missing: %s", listRaw)
	}

	getReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/audit-logs/"+id.String(), nil)
	getReq.AddCookie(adminCookie)
	getRes, err := http.DefaultClient.Do(getReq)
	if err != nil {
		t.Fatal(err)
	}
	defer getRes.Body.Close()
	getRaw, _ := io.ReadAll(getRes.Body)
	if getRes.StatusCode != http.StatusOK {
		t.Fatalf("get status=%d body=%s", getRes.StatusCode, getRaw)
	}
	if !strings.Contains(string(getRaw), "edge-01") {
		t.Fatalf("metadata missing in get: %s", getRaw)
	}

	// Filter by actor email
	actorReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/audit-logs?actor=admin-audit&limit=5", nil)
	actorReq.AddCookie(adminCookie)
	actorRes, err := http.DefaultClient.Do(actorReq)
	if err != nil {
		t.Fatal(err)
	}
	defer actorRes.Body.Close()
	if actorRes.StatusCode != http.StatusOK {
		t.Fatalf("actor filter status=%d", actorRes.StatusCode)
	}

	// Date range filter should still work
	since := time.Now().UTC().Add(-time.Hour).Format(time.RFC3339)
	rangeReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/audit-logs?since="+since, nil)
	rangeReq.AddCookie(adminCookie)
	rangeRes, err := http.DefaultClient.Do(rangeReq)
	if err != nil {
		t.Fatal(err)
	}
	rangeRes.Body.Close()
	if rangeRes.StatusCode != http.StatusOK {
		t.Fatalf("since filter status=%d", rangeRes.StatusCode)
	}
}
