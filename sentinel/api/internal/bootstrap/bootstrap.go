package bootstrap

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// EnsureFirstAdmin creates the first ADMIN user when the database has zero users.
// Credentials come from SENTINEL_BOOTSTRAP_ADMIN_EMAIL and SENTINEL_BOOTSTRAP_ADMIN_PASSWORD (never logged).
func EnsureFirstAdmin(ctx context.Context, pool *pgxpool.Pool) (created bool, err error) {
	n, err := store.CountUsers(ctx, pool)
	if err != nil {
		return false, err
	}
	if n > 0 {
		return false, nil
	}
	email := strings.TrimSpace(os.Getenv("SENTINEL_BOOTSTRAP_ADMIN_EMAIL"))
	pass := os.Getenv("SENTINEL_BOOTSTRAP_ADMIN_PASSWORD")
	if email == "" || pass == "" {
		return false, nil
	}
	if len(pass) < 12 {
		return false, fmt.Errorf("SENTINEL_BOOTSTRAP_ADMIN_PASSWORD must be at least 12 characters")
	}
	hash, err := password.Hash(pass)
	if err != nil {
		return false, err
	}
	id, err := store.CreateUser(ctx, pool, strings.ToLower(email), hash, "Administrator")
	if err != nil {
		return false, err
	}
	// Prefer SUPER_ADMIN when migration 00008 has run; fall back to ADMIN.
	bootRole := "SUPER_ADMIN"
	if _, err := store.RoleIDByName(ctx, pool, bootRole); err != nil {
		bootRole = "ADMIN"
	}
	if err := store.SetUserRoles(ctx, pool, id, []string{bootRole}, nil); err != nil {
		return false, err
	}
	_ = store.Audit(ctx, pool, &id, "user", "user.created", "user", &id, map[string]any{"bootstrap": true}, nil, "bootstrap")
	return true, nil
}
