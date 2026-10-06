package middleware_test

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
)

func TestRequirePermissionForbidden(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := middleware.RequirePermission("users", "write")(middleware.RequireAuth(next))

	req := httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	p := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"users:read"}),
	}
	req = httptest.NewRequest(http.MethodGet, "/api/v1/users", nil)
	req = req.WithContext(principal.WithContext(req.Context(), p))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}
}

func TestRequirePermissionAllowed(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
	})
	h := middleware.RequirePermission("users", "write")(middleware.RequireAuth(next))
	p := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"users:write"}),
	}
	req := httptest.NewRequest(http.MethodPost, "/api/v1/users", nil)
	req = req.WithContext(principal.WithContext(req.Context(), p))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}
