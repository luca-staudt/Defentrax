package principal_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/principal"
)

func TestHasPermissionExact(t *testing.T) {
	p := &principal.Principal{
		UserID:      uuid.New(),
		Permissions: principal.PermissionSet([]string{"alerts:read", "events:read"}),
	}
	if !p.HasPermission("alerts", "read") {
		t.Fatal("expected alerts:read")
	}
	if p.HasPermission("alerts", "write") {
		t.Fatal("expected no alerts:write")
	}
}

func TestAdminRoleBypassesPermissionCheck(t *testing.T) {
	p := &principal.Principal{
		UserID: uuid.New(),
		Roles:  []string{"ADMIN"},
	}
	if !p.HasPermission("users", "write") {
		t.Fatal("ADMIN should grant any permission")
	}
}

func TestHasRole(t *testing.T) {
	p := &principal.Principal{Roles: []string{"VIEWER", "OPERATOR"}}
	if !p.HasRole("VIEWER") || p.HasRole("ADMIN") {
		t.Fatal("HasRole mismatch")
	}
}

func TestNilPrincipalHasNoPermission(t *testing.T) {
	var p *principal.Principal
	if p.HasPermission("alerts", "read") {
		t.Fatal("nil principal must deny")
	}
}
