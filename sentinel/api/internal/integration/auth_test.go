//go:build integration

package integration_test

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"os"
	"os/exec"
	"path/filepath"
	"testing"
	"time"

	"github.com/pquerna/otp/totp"

	authtotp "github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/totp"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

func testDSN(t *testing.T) string {
	t.Helper()
	if u := os.Getenv("TEST_DATABASE_URL"); u != "" {
		return u
	}
	return "postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable"
}

func resetAndMigrate(t *testing.T, dsn string) {
	t.Helper()
	dbDir := filepath.Join(repoRoot(t), "sentinel", "database")
	for i := 0; i < 5; i++ {
		runDBMigrate(t, dbDir, dsn, "down")
	}
	runDBMigrate(t, dbDir, dsn, "up")
}

func repoRoot(t *testing.T) string {
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

func runDBMigrate(t *testing.T, dbDir, dsn, cmd string) {
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

func testConfig(dsn string) config.Config {
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
	}
}

func TestAuthFlowIntegration(t *testing.T) {
	dsn := testDSN(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	pool, err := db.OpenPool(ctx, dsn)
	if err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	pool.Close()

	resetAndMigrate(t, dsn)
	pool, err = db.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()

	hash, _ := password.Hash("integration-test-password")
	id, err := store.CreateUser(ctx, pool, "analyst@test.local", hash, "Analyst")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	if err := store.SetUserRoles(ctx, pool, id, []string{"VIEWER"}, nil); err != nil {
		t.Fatalf("roles: %v", err)
	}

	cfg := testConfig(dsn)
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
	dsn := testDSN(t)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()

	pool, err := db.OpenPool(ctx, dsn)
	if err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	pool.Close()

	resetAndMigrate(t, dsn)
	pool, err = db.OpenPool(ctx, dsn)
	if err != nil {
		t.Fatalf("pool: %v", err)
	}
	defer pool.Close()

	hash, _ := password.Hash("integration-test-password")
	id, err := store.CreateUser(ctx, pool, "2fa@test.local", hash, "2FA")
	if err != nil {
		t.Fatalf("create user: %v", err)
	}
	_ = store.SetUserRoles(ctx, pool, id, []string{"VIEWER"}, nil)

	cfg := testConfig(dsn)
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
