package server_test

import (
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/server"
)

func TestHandlerSetsSecurityHeaders(t *testing.T) {
	cfg := config.Config{
		Port:               8080,
		SessionCookieName:  "sentinel_session",
		CookieSecure:       true,
		CORSAllowedOrigins: "http://localhost:3000",
	}
	s := server.New(slog.Default(), cfg, nil,
		ratelimit.NewMemory(10, time.Minute),
		ratelimit.NewMemory(10, time.Minute),
		ratelimit.NewMemory(10, time.Minute),
	)
	rec := httptest.NewRecorder()
	s.Handler().ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if rec.Code != http.StatusOK {
		t.Fatalf("status=%d", rec.Code)
	}
	if got := rec.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options=%q", got)
	}
	if got := rec.Header().Get("Strict-Transport-Security"); got == "" {
		t.Fatal("expected HSTS when CookieSecure=true")
	}
	if got := rec.Header().Get("X-Frame-Options"); got != "DENY" {
		t.Fatalf("X-Frame-Options=%q", got)
	}
}
