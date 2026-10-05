//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"

	authtotp "github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/totp"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/testutil"
)

func TestAuthFlowIntegration(t *testing.T) {
	dsn := testutil.TestDSN(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	testutil.SkipUnlessPostgres(t, dsn)
	pool := testutil.ResetAndMigrate(t, dsn, 5)

	hash, _ := password.Hash("integration-test-password")
	id, err := store.CreateUser(ctx, pool, "analyst@test.local", hash, "Analyst")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := store.SetUserRoles(ctx, pool, id, []string{"VIEWER"}, nil); err != nil {
		t.Fatalf("roles: %v", err)
	}

	cfg := testutil.TestConfig(dsn)
	srv := server.New(slog.Default(), cfg, pool, ratelimit.NewMemory(100, time.Minute), ratelimit.NewMemory(1000, time.Minute))
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	res, _ := http.Get(ts.URL + "/api/v1/users")
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", res.StatusCode)
	}
	_ = res.Body.Close()

	loginBody, _ := json.Marshal(map[string]string{
		"email":    "analyst@test.local",
		"password": "integration-test-password",
	})
	res, err = http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status %d", res.StatusCode)
	}
	cookie := res.Cookies()[0]
	_ = res.Body.Close()

	client := &http.Client{}
	createBody, _ := json.Marshal(map[string]string{
		"email":    "new@test.local",
		"password": "integration-test-password-long",
	})
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/users", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(cookie)
	res, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusForbidden {
		t.Fatalf("viewer expected 403 on create user, got %d", res.StatusCode)
	}
	_ = res.Body.Close()

	_, _ = pool.Exec(ctx, `UPDATE sessions SET expires_at = now() - interval '1 minute'`)
	req, _ = http.NewRequest(http.MethodGet, ts.URL+"/api/v1/auth/me", nil)
	req.AddCookie(cookie)
	res, err = client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expired session expected 401, got %d", res.StatusCode)
	}
	_ = res.Body.Close()
}

func TestTOTPLoginIntegration(t *testing.T) {
	dsn := testutil.TestDSN(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	testutil.SkipUnlessPostgres(t, dsn)
	pool := testutil.ResetAndMigrate(t, dsn, 5)

	hash, _ := password.Hash("integration-test-password")
	id, err := store.CreateUser(ctx, pool, "2fa@test.local", hash, "2FA")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	_ = store.SetUserRoles(ctx, pool, id, []string{"VIEWER"}, nil)

	cfg := testutil.TestConfig(dsn)
	secret := "JBSWY3DPEHPK3PXP"
	enc, err := authtotp.EncryptSecret(cfg.TOTPEncryptionKey, secret)
	if err != nil {
		t.Fatal(err)
	}
	backup, err := authtotp.HashRecoveryCodes([]string{"recovery-one"})
	if err != nil {
		t.Fatal(err)
	}
	_ = store.UpsertTwoFactorPending(ctx, pool, id, enc, backup)
	_ = store.EnableTwoFactor(ctx, pool, id)

	srv := server.New(slog.Default(), cfg, pool, ratelimit.NewMemory(100, time.Minute), ratelimit.NewMemory(1000, time.Minute))
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	loginBody, _ := json.Marshal(map[string]string{
		"email":    "2fa@test.local",
		"password": "integration-test-password",
	})
	res, _ := http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(loginBody))
	var lr struct {
		RequiresTOTP   bool   `json:"requires_totp"`
		LoginChallenge string `json:"login_challenge"`
	}
	_ = json.NewDecoder(res.Body).Decode(&lr)
	_ = res.Body.Close()
	if !lr.RequiresTOTP || lr.LoginChallenge == "" {
		t.Fatal("expected totp challenge")
	}
	code, _ := totp.GenerateCode(secret, time.Now())
	verifyBody, _ := json.Marshal(map[string]string{
		"login_challenge": lr.LoginChallenge,
		"code":            code,
	})
	res, _ = http.Post(ts.URL+"/api/v1/auth/totp/verify", "application/json", bytes.NewReader(verifyBody))
	if res.StatusCode != http.StatusOK {
		t.Fatalf("totp verify status %d", res.StatusCode)
	}
	if len(res.Cookies()) == 0 {
		t.Fatal("expected session cookie")
	}
	_ = res.Body.Close()
}
