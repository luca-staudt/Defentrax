package seed

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"
	"golang.org/x/crypto/bcrypt"
)

// Allowed returns true when dev seeding is explicitly enabled.
func Allowed() bool {
	if strings.TrimSpace(os.Getenv("APP_ENV")) != "development" {
		return false
	}
	v := strings.ToLower(strings.TrimSpace(os.Getenv("SENTINEL_SEED_DEV")))
	return v == "1" || v == "true" || v == "yes"
}

// RunDev inserts reference RBAC data for local development. It never runs unless Allowed().
// An optional admin user is created only when SENTINEL_DEV_ADMIN_PASSWORD is set (never hardcoded).
func RunDev(ctx context.Context, pool *pgxpool.Pool) error {
	if !Allowed() {
		return fmt.Errorf("dev seed refused: set APP_ENV=development and SENTINEL_SEED_DEV=true")
	}

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	roles := []struct {
		name, desc string
	}{
		{"SUPER_ADMIN", "Super Admin — unrestricted platform control"},
		{"ADMIN", "Admin — full platform administration"},
		{"SECURITY_ANALYST", "Investigate alerts and tune detection"},
		{"OPERATOR", "Manage servers, agents, and notifications"},
		{"VIEWER", "Read-only access"},
	}
	for _, r := range roles {
		_, err := tx.Exec(ctx, `
			INSERT INTO roles (name, description)
			VALUES ($1, $2)
			ON CONFLICT (name) DO NOTHING
		`, r.name, r.desc)
		if err != nil {
			return fmt.Errorf("seed role %s: %w", r.name, err)
		}
	}

	perms := []struct{ resource, action, desc string }{
		{"users", "read", "View users"},
		{"users", "write", "Manage users"},
		{"alerts", "read", "View alerts"},
		{"alerts", "write", "Update alert lifecycle"},
		{"events", "read", "View events"},
		{"servers", "read", "View servers and agents"},
		{"servers", "write", "Manage servers and agents"},
		{"rules", "read", "View detection rules"},
		{"rules", "write", "Manage detection rules"},
		{"notifications", "read", "View notification channels and rules"},
		{"notifications", "write", "Manage notification channels and rules"},
		{"plugins", "read", "View plugins and plugin configs"},
		{"plugins", "write", "Enable/disable plugins and manage plugin configs"},
		{"audit_logs", "read", "View audit trail"},
		{"audit_logs", "export", "Export audit trail"},
		{"roles", "read", "View roles and permission assignments"},
		{"roles", "write", "Manage custom roles and permissions"},
		{"settings", "read", "View platform settings"},
		{"settings", "write", "Edit platform settings"},
		{"api_keys", "write", "Manage personal API keys"},
	}
	for _, p := range perms {
		_, err := tx.Exec(ctx, `
			INSERT INTO permissions (resource, action, description)
			VALUES ($1, $2, $3)
			ON CONFLICT (resource, action) DO NOTHING
		`, p.resource, p.action, p.desc)
		if err != nil {
			return fmt.Errorf("seed permission %s.%s: %w", p.resource, p.action, err)
		}
	}

	adminPassword := strings.TrimSpace(os.Getenv("SENTINEL_DEV_ADMIN_PASSWORD"))
	if adminPassword != "" {
		adminEmail := strings.TrimSpace(os.Getenv("SENTINEL_DEV_ADMIN_EMAIL"))
		if adminEmail == "" {
			adminEmail = "admin@localhost"
		}
		hash, err := bcrypt.GenerateFromPassword([]byte(adminPassword), bcrypt.DefaultCost)
		if err != nil {
			return fmt.Errorf("hash dev admin password: %w", err)
		}

		var userID string
		err = tx.QueryRow(ctx, `
			INSERT INTO users (email, password_hash, display_name)
			VALUES ($1, $2, 'Development Admin')
			ON CONFLICT (email) DO UPDATE SET updated_at = now()
			RETURNING id
		`, adminEmail, string(hash)).Scan(&userID)
		if err != nil {
			return fmt.Errorf("upsert dev admin user: %w", err)
		}

		_, err = tx.Exec(ctx, `
			INSERT INTO user_roles (user_id, role_id)
			SELECT $1, id FROM roles WHERE name = 'SUPER_ADMIN'
			ON CONFLICT DO NOTHING
		`, userID)
		if err != nil {
			return fmt.Errorf("assign super admin role: %w", err)
		}
		_, err = tx.Exec(ctx, `
			INSERT INTO user_roles (user_id, role_id)
			SELECT $1, id FROM roles WHERE name = 'ADMIN'
			  AND NOT EXISTS (
			    SELECT 1 FROM user_roles ur WHERE ur.user_id = $1
			  )
			ON CONFLICT DO NOTHING
		`, userID)
		if err != nil {
			return fmt.Errorf("assign admin role: %w", err)
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return err
	}
	return nil
}
