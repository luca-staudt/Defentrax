package openapi_test

import (
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/luca-staudt/Sentinel/sentinel/api/openapi"
)

// implementedPaths is the inventory of HTTP routes registered in
// sentinel/api/internal/server/server.go (plus health/meta/docs).
// Keep in sync when adding or removing handlers — do not document fake endpoints.
var implementedPaths = []string{
	"/healthz",
	"/readyz",
	"/api/v1",
	"/api/v1/openapi.yaml",
	"/api/v1/docs",
	"/api/v1/auth/login",
	"/api/v1/auth/totp/verify",
	"/api/v1/auth/recovery/verify",
	"/api/v1/auth/logout",
	"/api/v1/auth/me",
	"/api/v1/auth/totp/enroll",
	"/api/v1/auth/totp/confirm",
	"/api/v1/auth/totp/disable",
	"/api/v1/users",
	"/api/v1/users/{id}/roles",
	"/api/v1/users/me/api-keys",
	"/api/v1/users/me/api-keys/{id}",
	"/api/v1/servers",
	"/api/v1/servers/{id}",
	"/api/v1/servers/{id}/enrollment-tokens",
	"/api/v1/agent/enroll",
	"/api/v1/agent/heartbeat",
	"/api/v1/agent/events",
	"/api/v1/events",
	"/api/v1/events/{id}",
	"/api/v1/alerts",
	"/api/v1/alerts/recent-events",
	"/api/v1/alerts/{id}",
	"/api/v1/ws/alerts",
	"/api/v1/rules",
	"/api/v1/rules/{id}",
	"/api/v1/notification-channels",
	"/api/v1/notification-channels/{id}",
	"/api/v1/notification-rules",
	"/api/v1/notification-rules/{id}",
	"/api/v1/dashboard/stats",
	"/api/v1/plugins",
	"/api/v1/plugins/{id}",
	"/api/v1/plugins/{id}/configs",
	"/api/v1/plugins/{id}/configs/{key}",
}

func TestOpenAPICoversImplementedRoutes(t *testing.T) {
	spec := string(openapi.SpecYAML)
	if !strings.HasPrefix(strings.TrimSpace(spec), "openapi: 3.") {
		t.Fatalf("expected OpenAPI 3.x document")
	}

	paths := extractPathKeys(spec)
	for _, p := range implementedPaths {
		if _, ok := paths[p]; !ok {
			t.Errorf("missing path in OpenAPI spec: %s", p)
		}
	}
	for p := range paths {
		found := false
		for _, want := range implementedPaths {
			if p == want {
				found = true
				break
			}
		}
		if !found {
			t.Errorf("OpenAPI documents unimplemented path: %s", p)
		}
	}
}

func TestSpecAndUIHandlers(t *testing.T) {
	rec := httptest.NewRecorder()
	openapi.Spec(rec, httptest.NewRequest("GET", "/api/v1/openapi.yaml", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "openapi:") {
		t.Fatalf("Spec handler unexpected: status=%d", rec.Code)
	}
	if ct := rec.Header().Get("Content-Type"); !strings.Contains(ct, "yaml") {
		t.Fatalf("Spec Content-Type: %q", ct)
	}

	rec = httptest.NewRecorder()
	openapi.UI(rec, httptest.NewRequest("GET", "/api/v1/docs", nil))
	if rec.Code != 200 || !strings.Contains(rec.Body.String(), "swagger-ui") {
		t.Fatalf("UI handler unexpected: status=%d", rec.Code)
	}
}

// extractPathKeys reads top-level keys under the paths: mapping without a YAML dependency.
func extractPathKeys(spec string) map[string]struct{} {
	out := map[string]struct{}{}
	inPaths := false
	for _, line := range strings.Split(spec, "\n") {
		if !inPaths {
			if line == "paths:" {
				inPaths = true
			}
			continue
		}
		if len(line) > 0 && line[0] != ' ' && line[0] != '#' && strings.HasSuffix(line, ":") {
			// Next top-level key (e.g. components:)
			break
		}
		if strings.HasPrefix(line, "  /") && strings.HasSuffix(line, ":") {
			key := strings.TrimSuffix(strings.TrimSpace(line), ":")
			out[key] = struct{}{}
		}
	}
	return out
}
