package principal

import (
	"context"

	"github.com/google/uuid"
)

type ctxKey struct{}

// Principal is the authenticated caller attached to request context.
type Principal struct {
	UserID      uuid.UUID
	Email       string
	Roles       []string
	Permissions map[string]struct{}
	AuthMethod  string // session | api_key
	SessionID   uuid.UUID
	APIKeyID    uuid.UUID
}

func WithContext(ctx context.Context, p *Principal) context.Context {
	return context.WithValue(ctx, ctxKey{}, p)
}

func FromContext(ctx context.Context) (*Principal, bool) {
	p, ok := ctx.Value(ctxKey{}).(*Principal)
	return p, ok
}

func (p *Principal) HasPermission(resource, action string) bool {
	if p == nil {
		return false
	}
	key := resource + ":" + action
	if _, ok := p.Permissions[key]; ok {
		return true
	}
	for _, r := range p.Roles {
		// SUPER_ADMIN and legacy ADMIN bypass granular checks.
		if r == "SUPER_ADMIN" || r == "ADMIN" {
			return true
		}
	}
	return false
}

func (p *Principal) HasRole(role string) bool {
	for _, r := range p.Roles {
		if r == role {
			return true
		}
	}
	return false
}

func PermissionSet(perms []string) map[string]struct{} {
	m := make(map[string]struct{}, len(perms))
	for _, p := range perms {
		m[p] = struct{}{}
	}
	return m
}
