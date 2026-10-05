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

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/testutil"
)

func TestAPIKeyAuthIntegration(t *testing.T) {
	dsn := testutil.TestDSN(t)
	testutil.SkipUnlessPostgres(t, dsn)
	pool := testutil.ResetAndMigrate(t, dsn, 12)
	ctx := context.Background()

	hash, err := password.Hash("integration-test-password-long")
	if err != nil {
		t.Fatal(err)
	}
	adminID, err := store.CreateUser(ctx, pool, "admin-apikey@test.local", hash, "Admin")
	if err != nil {
		t.Fatal(err)
	}
	if err := store.SetUserRoles(ctx, pool, adminID, []string{"ADMIN"}, nil); err != nil {
		t.Fatal(err)
	}

	cfg := testutil.TestConfig(dsn)
	srv := server.New(slog.Default(), cfg, pool, ratelimit.NewMemory(100, time.Minute), ratelimit.NewMemory(1000, time.Minute))
	ts := httptest.NewServer(srv.Handler())
	defer ts.Close()

	loginBody, _ := json.Marshal(map[string]string{
		"email":    "admin-apikey@test.local",
		"password": "integration-test-password-long",
	})
	res, err := http.Post(ts.URL+"/api/v1/auth/login", "application/json", bytes.NewReader(loginBody))
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusOK {
		t.Fatalf("login status %d", res.StatusCode)
	}
	sessionCookie := res.Cookies()[0]
	_ = res.Body.Close()

	createBody, _ := json.Marshal(map[string]string{"name": "ci-key"})
	req, _ := http.NewRequest(http.MethodPost, ts.URL+"/api/v1/users/me/api-keys", bytes.NewReader(createBody))
	req.Header.Set("Content-Type", "application/json")
	req.AddCookie(sessionCookie)
	res, err = http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	if res.StatusCode != http.StatusCreated {
		t.Fatalf("create key status %d", res.StatusCode)
	}
	var keyResp struct {
		Key string `json:"key"`
		ID  string `json:"id"`
	}
	if err := json.NewDecoder(res.Body).Decode(&keyResp); err != nil {
		t.Fatal(err)
	}
	_ = res.Body.Close()
	if keyResp.Key == "" || len(keyResp.Key) < 10 {
		t.Fatal("expected plaintext key on create")
	}

	meReq, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/auth/me", nil)
	meReq.Header.Set("Authorization", "Bearer "+keyResp.Key)
	meRes, err := http.DefaultClient.Do(meReq)
	if err != nil {
		t.Fatal(err)
	}
	defer meRes.Body.Close()
	if meRes.StatusCode != http.StatusOK {
		t.Fatalf("me with api key expected 200, got %d", meRes.StatusCode)
	}
	var me map[string]any
	if err := json.NewDecoder(meRes.Body).Decode(&me); err != nil {
		t.Fatal(err)
	}
	if me["email"] != "admin-apikey@test.local" {
		t.Fatalf("unexpected me: %+v", me)
	}

	delReq, _ := http.NewRequest(http.MethodDelete, ts.URL+"/api/v1/users/me/api-keys/"+keyResp.ID, nil)
	delReq.AddCookie(sessionCookie)
	delRes, err := http.DefaultClient.Do(delReq)
	if err != nil {
		t.Fatal(err)
	}
	delRes.Body.Close()
	if delRes.StatusCode != http.StatusNoContent && delRes.StatusCode != http.StatusOK {
		t.Fatalf("revoke status %d", delRes.StatusCode)
	}

	meReq2, _ := http.NewRequest(http.MethodGet, ts.URL+"/api/v1/auth/me", nil)
	meReq2.Header.Set("Authorization", "Bearer "+keyResp.Key)
	meRes2, err := http.DefaultClient.Do(meReq2)
	if err != nil {
		t.Fatal(err)
	}
	meRes2.Body.Close()
	if meRes2.StatusCode != http.StatusUnauthorized {
		t.Fatalf("revoked key expected 401, got %d", meRes2.StatusCode)
	}
}
