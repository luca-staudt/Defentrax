package handlers

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/realtime"
)

func TestAlertsWSRequiresAuth(t *testing.T) {
	h := &RealtimeHandler{Hub: realtime.NewHub(8)}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts/ws", nil)
	rec := httptest.NewRecorder()
	h.AlertsWS(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}
}

func TestAlertsWSRequiresAlertsRead(t *testing.T) {
	h := &RealtimeHandler{Hub: realtime.NewHub(8)}
	p := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"events:read"}),
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts/ws", nil)
	req = req.WithContext(principal.WithContext(req.Context(), p))
	rec := httptest.NewRecorder()
	h.AlertsWS(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestAlertsWSUnavailableWithoutHub(t *testing.T) {
	h := &RealtimeHandler{Hub: nil}
	p := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"alerts:read"}),
	}
	req := httptest.NewRequest(http.MethodGet, "/api/v1/alerts/ws", nil)
	req = req.WithContext(principal.WithContext(req.Context(), p))
	rec := httptest.NewRecorder()
	h.AlertsWS(rec, req)
	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d", rec.Code)
	}
}
