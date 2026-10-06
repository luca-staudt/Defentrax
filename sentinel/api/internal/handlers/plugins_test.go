package handlers_test

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/google/uuid"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/plugins/sdk"
)

func TestPluginsPermissionGate(t *testing.T) {
	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"ok":true}`))
	})
	h := middleware.RequirePermission("plugins", "write")(middleware.RequireAuth(next))

	req := httptest.NewRequest(http.MethodPatch, "/api/v1/plugins/"+uuid.NewString(), bytes.NewReader([]byte(`{"enabled":true}`)))
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", rec.Code)
	}

	p := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"plugins:read"}),
	}
	req = httptest.NewRequest(http.MethodPatch, "/api/v1/plugins/"+uuid.NewString(), bytes.NewReader([]byte(`{"enabled":true}`)))
	req = req.WithContext(principal.WithContext(req.Context(), p))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d", rec.Code)
	}

	p2 := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"plugins:write"}),
	}
	req = httptest.NewRequest(http.MethodPatch, "/api/v1/plugins/"+uuid.NewString(), bytes.NewReader([]byte(`{"enabled":true}`)))
	req = req.WithContext(principal.WithContext(req.Context(), p2))
	rec = httptest.NewRecorder()
	h.ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", rec.Code)
	}
}

func TestSupportMatrixJSONShape(t *testing.T) {
	support := sdk.V1Support()
	b, err := json.Marshal(support)
	if err != nil {
		t.Fatal(err)
	}
	var decoded []map[string]any
	if err := json.Unmarshal(b, &decoded); err != nil {
		t.Fatal(err)
	}
	if len(decoded) != 4 {
		t.Fatalf("want 4 support rows, got %d", len(decoded))
	}
}
