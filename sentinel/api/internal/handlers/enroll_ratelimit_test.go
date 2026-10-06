package handlers

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/ratelimit"
)

func TestEnrollRateLimited(t *testing.T) {
	lim := ratelimit.NewMemory(1, time.Minute)
	h := &AgentHandler{EnrollLimiter: lim}

	// Invalid token shape fails after the limiter without touching the DB.
	body := `{"enrollment_token":"not-a-real-token"}`
	req1 := httptest.NewRequest(http.MethodPost, "/api/v1/agent/enroll", strings.NewReader(body))
	req1.RemoteAddr = "203.0.113.10:1234"
	rec1 := httptest.NewRecorder()
	h.Enroll(rec1, req1)
	if rec1.Code == http.StatusTooManyRequests {
		t.Fatalf("first enroll unexpectedly rate limited")
	}
	if rec1.Code != http.StatusBadRequest {
		t.Fatalf("first enroll status=%d want 400", rec1.Code)
	}

	req2 := httptest.NewRequest(http.MethodPost, "/api/v1/agent/enroll", strings.NewReader(body))
	req2.RemoteAddr = "203.0.113.10:1234"
	rec2 := httptest.NewRecorder()
	h.Enroll(rec2, req2)
	if rec2.Code != http.StatusTooManyRequests {
		t.Fatalf("second enroll status=%d want 429", rec2.Code)
	}
}
