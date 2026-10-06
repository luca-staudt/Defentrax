package handlers_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
)

func TestAlertsWritePermissionRequired(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := middleware.RequirePermission("alerts", "write")(middleware.RequireAuth(next))

	p := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"alerts:read"}),
	}
	req := httptest.NewRequest(http.MethodPatch, "/api/v1/alerts/"+uuid.New().String(), nil)
	req = req.WithContext(principal.WithContext(req.Context(), p))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}
