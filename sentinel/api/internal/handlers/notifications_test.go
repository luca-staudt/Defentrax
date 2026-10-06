//go:build integration

package handlers_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"net/smtp"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/config"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/notify"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/realtime"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/server"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

func secretsKey() []byte {
	return []byte("0123456789abcdef0123456789abcdef")
}

type mockHTTP struct {
	mu        sync.Mutex
	calls     int
	failUntil int
	urls      []string
	bodies    []string
}

func (m *mockHTTP) Do(req *http.Request) (*http.Response, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.calls++
	m.urls = append(m.urls, req.URL.String())
	b, _ := io.ReadAll(req.Body)
	m.bodies = append(m.bodies, string(b))
	if m.calls <= m.failUntil {
		return &http.Response{StatusCode: 500, Body: io.NopCloser(bytes.NewReader([]byte("err"))), Header: make(http.Header)}, nil
	}
	return &http.Response{StatusCode: 204, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
}

func startNotifyTestServer(t *testing.T, pool *pgxpool.Pool, dsn string, disp *notify.Dispatcher) *httptest.Server {
	t.Helper()
	cfg := config.Config{
		Port:                 0,
		SessionCookieName:    "sid",
		SessionTTL:           24 * time.Hour,
		DatabaseURL:          dsn,
		SecretsEncryptionKey: secretsKey(),
		NotifyMaxAttempts:    5,
		NotifyBaseBackoff:    20 * time.Millisecond,
		NotifyMaxBackoff:     100 * time.Millisecond,
	}
	sec, _ := base64.StdEncoding.DecodeString("YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=")
	cfg.SessionSecret = sec
	hub := realtime.NewHub(16)
	s := server.NewWithOptions(slog.Default(), cfg, pool, ratelimit.NewMemory(1000, time.Minute), ratelimit.NewMemory(1000, time.Minute), ratelimit.NewMemory(1000, time.Minute), server.Options{
		AlertHub:   hub,
		Notifier:   disp,
		SecretsKey: secretsKey(),
	})
	ts := httptest.NewServer(s.Handler())
	t.Cleanup(ts.Close)
	return ts
}

func createRoleUser(t *testing.T, pool *pgxpool.Pool, email, role string) {
	t.Helper()
	hash, _ := password.Hash("integration-test-password-long")
	id, err := store.CreateUser(context.Background(), pool, email, hash, role)
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetUserRoles(context.Background(), pool, id, []string{role}, nil); err != nil {
		t.Fatal(err)
	}
}

func TestNotificationChannelsSecretsNeverReturned(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	createRoleUser(t, pool, "ops-notify@test.local", "OPERATOR")

	disp := notify.NewDispatcher(slog.Default(), pool, secretsKey())
	disp.Async = false
	t.Cleanup(disp.Close)

	ts := startNotifyTestServer(t, pool, dsn, disp)
	cookie := loginUser(t, ts.URL, "ops-notify@test.local", "integration-test-password-long")

	webhook := "https://discord.com/api/webhooks/111/super-secret-value"
	body, _ := json.Marshal(map[string]any{
		"name":         "ops-discord",
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
	if strings.Contains(string(raw), "super-secret-value") || strings.Contains(string(raw), webhook) {
		t.Fatalf("secret leaked in API response: %s", raw)
	}
	var created struct {
		ID         uuid.UUID `json:"id"`
		HasSecrets bool      `json:"has_secrets"`
	}
	if err := json.Unmarshal(raw, &created); err != nil {
		t.Fatal(err)
	}
	if !created.HasSecrets {
		t.Fatal("expected has_secrets")
	}

	getReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/notification-channels/"+created.ID.String(), nil)
	getReq.AddCookie(cookie)
	getRes, err := http.DefaultClient.Do(getReq)
	if err != nil {
		t.Fatal(err)
	}
	defer getRes.Body.Close()
	getRaw, _ := io.ReadAll(getRes.Body)
	if strings.Contains(string(getRaw), "super-secret-value") {
		t.Fatalf("secret leaked on get: %s", getRaw)
	}

	// Confirm ciphertext stored and decryptable server-side
	ch, err := store.GetNotificationChannel(context.Background(), pool, created.ID)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(ch.SecretsEncrypted, "super-secret") {
		t.Fatal("plaintext secret in DB column")
	}
	sec, err := notify.DecryptSecrets(secretsKey(), ch.SecretsEncrypted)
	if err != nil {
		t.Fatal(err)
	}
	if sec.WebhookURL != webhook {
		t.Fatalf("decrypt mismatch: %s", sec.WebhookURL)
	}
}

func TestNotificationRBACViewerForbiddenWrite(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	createRoleUser(t, pool, "viewer-notify@test.local", "VIEWER")

	ts := startNotifyTestServer(t, pool, dsn, nil)
	cookie := loginUser(t, ts.URL, "viewer-notify@test.local", "integration-test-password-long")

	body := []byte(`{"name":"x","channel_type":"discord","secrets":{"webhook_url":"https://example.com/h"}}`)
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/notification-channels", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	res, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	res.Body.Close()
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", res.StatusCode)
	}

	listReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/notification-channels", nil)
	listReq.AddCookie(cookie)
	listRes, err := http.DefaultClient.Do(listReq)
	if err != nil {
		t.Fatal(err)
	}
	listRes.Body.Close()
	if listRes.StatusCode != http.StatusOK {
		t.Fatalf("viewer read expected 200, got %d", listRes.StatusCode)
	}
}

func TestNotificationDispatchRetryAndAudit(t *testing.T) {
	dsn := testDSN(t)
	skipUnlessPostgres(t, dsn)
	pool := resetDB(t, dsn)
	ctx := context.Background()

	mock := &mockHTTP{failUntil: 2}
	disp := notify.NewDispatcher(slog.Default(), pool, secretsKey())
	disp.Async = false
	disp.MaxAttempts = 4
	disp.BaseBackoff = 10 * time.Millisecond
	disp.MaxBackoff = 50 * time.Millisecond
	disp.Webhooks = &notify.WebhookSender{Client: mock}
	var smtpCalls atomic.Int32
	disp.Email = &notify.EmailSender{
		Send: func(addr string, a smtp.Auth, from string, to []string, msg []byte) error {
			smtpCalls.Add(1)
			return nil
		},
	}
	t.Cleanup(disp.Close)

	srv, err := store.CreateServer(ctx, pool, "n1", "n1.local", "", "")
	if err != nil {
		t.Fatal(err)
	}
	alertID, err := store.CreateAlert(ctx, pool, store.AlertCreateParams{
		ServerID:    srv.ID,
		Title:       "Possible critical event",
		Description: "test",
		Severity:    "critical",
		DedupKey:    "dedup-notify-1",
		OccurredAt:  time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}

	discord, err := store.CreateNotificationChannel(ctx, pool, store.ChannelCreateParams{
		Name:        "discord-crit",
		ChannelType: notify.ChannelDiscord,
		Config:      []byte(`{}`),
		Enabled:     true,
	})
	if err != nil {
		t.Fatal(err)
	}
	enc, err := notify.EncryptSecrets(secretsKey(), notify.ChannelSecrets{WebhookURL: "https://discord.com/api/webhooks/42/token-SECRET"})
	if err != nil {
		t.Fatal(err)
	}
	has := true
	discord, err = store.UpdateNotificationChannel(ctx, pool, discord.ID, store.ChannelUpdateParams{
		SecretsEncrypted: &enc,
		HasSecrets:       &has,
	})
	if err != nil {
		t.Fatal(err)
	}

	emailCh, err := store.CreateNotificationChannel(ctx, pool, store.ChannelCreateParams{
		Name:        "email-crit",
		ChannelType: notify.ChannelEmail,
		Config:      []byte(`{"smtp_host":"smtp.test","smtp_port":587,"from":"a@b.c","to":["oncall@example.com"],"username":"u"}`),
		Enabled:     true,
	})
	if err != nil {
		t.Fatal(err)
	}
	emailEnc, err := notify.EncryptSecrets(secretsKey(), notify.ChannelSecrets{SMTPPassword: "pw"})
	if err != nil {
		t.Fatal(err)
	}
	emailCh, err = store.UpdateNotificationChannel(ctx, pool, emailCh.ID, store.ChannelUpdateParams{
		SecretsEncrypted: &emailEnc,
		HasSecrets:       &has,
	})
	if err != nil {
		t.Fatal(err)
	}

	_, err = store.CreateNotificationRule(ctx, pool, store.RuleCreateParams{
		Name:        "critical-all",
		Enabled:     true,
		MinSeverity: "critical",
		Triggers:    []string{notify.TriggerAlertCreated},
		ChannelIDs:  []uuid.UUID{discord.ID, emailCh.ID},
	})
	if err != nil {
		t.Fatal(err)
	}
	// LOW severity rule should not fire for critical-only... also create a high-only discord rule unused
	_, err = store.CreateNotificationRule(ctx, pool, store.RuleCreateParams{
		Name:        "low-dash-only",
		Enabled:     true,
		MinSeverity: "low",
		Triggers:    []string{notify.TriggerAlertCreated},
		ChannelIDs:  []uuid.UUID{}, // dashboard only
	})
	if err != nil {
		t.Fatal(err)
	}

	disp.Notify(ctx, notify.AlertEvent{
		AlertID:    alertID,
		ServerID:   srv.ID,
		Title:      "Possible critical event",
		Severity:   "critical",
		Status:     "OPEN",
		EventCount: 1,
		Trigger:    notify.TriggerAlertCreated,
	})

	if mock.calls < 3 {
		t.Fatalf("expected retries then success, calls=%d", mock.calls)
	}
	if smtpCalls.Load() != 1 {
		t.Fatalf("expected 1 smtp call, got %d", smtpCalls.Load())
	}
	for _, u := range mock.urls {
		if notify.ContainsWebhookLeak(u) {
			// URLs are captured in mock for assertion but must not appear in DB error/audit
			break
		}
	}

	var failAudits int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM audit_logs WHERE action = 'notification.failed'`).Scan(&failAudits)
	if err != nil {
		t.Fatal(err)
	}
	if failAudits < 2 {
		t.Fatalf("expected audited failures, got %d", failAudits)
	}
	var meta string
	_ = pool.QueryRow(ctx, `SELECT metadata::text FROM audit_logs WHERE action = 'notification.failed' ORDER BY created_at LIMIT 1`).Scan(&meta)
	if notify.ContainsWebhookLeak(meta) || strings.Contains(meta, "token-SECRET") {
		t.Fatalf("webhook secret in audit metadata: %s", meta)
	}

	var sent int
	err = pool.QueryRow(ctx, `SELECT count(*) FROM notifications WHERE status = 'sent'`).Scan(&sent)
	if err != nil {
		t.Fatal(err)
	}
	if sent != 2 {
		t.Fatalf("expected 2 sent notifications, got %d", sent)
	}

	// LOW alert should not hit discord/email when only empty channel rule matches below critical
	lowAlert, err := store.CreateAlert(ctx, pool, store.AlertCreateParams{
		ServerID: srv.ID, Title: "Low noise", Description: "x", Severity: "low", DedupKey: "dedup-low", OccurredAt: time.Now().UTC(),
	})
	if err != nil {
		t.Fatal(err)
	}
	before := mock.calls
	disp.Notify(ctx, notify.AlertEvent{
		AlertID: lowAlert, ServerID: srv.ID, Title: "Low noise", Severity: "low", Status: "OPEN", EventCount: 1, Trigger: notify.TriggerAlertCreated,
	})
	if mock.calls != before {
		t.Fatalf("low severity should be dashboard-only (no webhook), calls %d -> %d", before, mock.calls)
	}
}
