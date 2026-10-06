package store

import (
	"context"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Role struct {
	ID          uuid.UUID `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	IsSystem    bool      `json:"is_system"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
	Permissions []string  `json:"permissions,omitempty"`
}

type Permission struct {
	ID          uuid.UUID `json:"id"`
	Resource    string    `json:"resource"`
	Action      string    `json:"action"`
	Key         string    `json:"key"`
	Description string    `json:"description"`
}

func ListPermissions(ctx context.Context, pool *pgxpool.Pool) ([]Permission, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, resource, action, description
		FROM permissions
		ORDER BY resource, action
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Permission
	for rows.Next() {
		var p Permission
		if err := rows.Scan(&p.ID, &p.Resource, &p.Action, &p.Description); err != nil {
			return nil, err
		}
		p.Key = p.Resource + ":" + p.Action
		out = append(out, p)
	}
	return out, rows.Err()
}

func ListRolePermissionKeys(ctx context.Context, pool *pgxpool.Pool, roleID uuid.UUID) ([]string, error) {
	rows, err := pool.Query(ctx, `
		SELECT p.resource, p.action
		FROM role_permissions rp
		JOIN permissions p ON p.id = rp.permission_id
		WHERE rp.role_id = $1
		ORDER BY p.resource, p.action
	`, roleID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []string
	for rows.Next() {
		var res, act string
		if err := rows.Scan(&res, &act); err != nil {
			return nil, err
		}
		out = append(out, res+":"+act)
	}
	return out, rows.Err()
}

func ListRoles(ctx context.Context, pool *pgxpool.Pool) ([]Role, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, name, description, COALESCE(is_system, FALSE), created_at, COALESCE(updated_at, created_at)
		FROM roles
		ORDER BY is_system DESC, name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roles []Role
	for rows.Next() {
		var r Role
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.IsSystem, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		perms, err := ListRolePermissionKeys(ctx, pool, r.ID)
		if err != nil {
			return nil, err
		}
		r.Permissions = perms
		roles = append(roles, r)
	}
	return roles, rows.Err()
}

func GetRoleByID(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (Role, error) {
	var r Role
	err := pool.QueryRow(ctx, `
		SELECT id, name, description, COALESCE(is_system, FALSE), created_at, COALESCE(updated_at, created_at)
		FROM roles WHERE id = $1
	`, id).Scan(&r.ID, &r.Name, &r.Description, &r.IsSystem, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Role{}, ErrNotFound
	}
	if err != nil {
		return Role{}, err
	}
	perms, err := ListRolePermissionKeys(ctx, pool, r.ID)
	if err != nil {
		return Role{}, err
	}
	r.Permissions = perms
	return r, nil
}

func CreateRole(ctx context.Context, pool *pgxpool.Pool, name, description string) (uuid.UUID, error) {
	name = strings.TrimSpace(name)
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO roles (name, description, is_system)
		VALUES ($1, $2, FALSE)
		RETURNING id
	`, name, description).Scan(&id)
	return id, err
}

func UpdateRole(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, name, description *string) error {
	role, err := GetRoleByID(ctx, pool, id)
	if err != nil {
		return err
	}
	if role.IsSystem && name != nil && *name != role.Name {
		return errors.New("cannot rename system role")
	}
	_, err = pool.Exec(ctx, `
		UPDATE roles SET
			name = COALESCE($2, name),
			description = COALESCE($3, description),
			updated_at = now()
		WHERE id = $1
	`, id, name, description)
	return err
}

func DeleteRole(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) error {
	role, err := GetRoleByID(ctx, pool, id)
	if err != nil {
		return err
	}
	if role.IsSystem {
		return errors.New("cannot delete system role")
	}
	n, err := CountUsersWithRole(ctx, pool, role.Name)
	if err != nil {
		return err
	}
	if n > 0 {
		return errors.New("role is assigned to users")
	}
	_, err = pool.Exec(ctx, `DELETE FROM roles WHERE id = $1`, id)
	return err
}

// SetRolePermissions replaces all permissions for a role.
// permissionKeys are "resource:action" strings.
func SetRolePermissions(ctx context.Context, pool *pgxpool.Pool, roleID uuid.UUID, permissionKeys []string) error {
	role, err := GetRoleByID(ctx, pool, roleID)
	if err != nil {
		return err
	}
	// System roles may have permission sets adjusted (custom hardening) except SUPER_ADMIN / ADMIN stay full via bypass.
	_ = role

	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `DELETE FROM role_permissions WHERE role_id = $1`, roleID)
	if err != nil {
		return err
	}

	for _, key := range permissionKeys {
		parts := strings.SplitN(strings.TrimSpace(key), ":", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
			return errors.New("invalid permission key: " + key)
		}
		tag, err := tx.Exec(ctx, `
			INSERT INTO role_permissions (role_id, permission_id)
			SELECT $1, id FROM permissions WHERE resource = $2 AND action = $3
		`, roleID, parts[0], parts[1])
		if err != nil {
			return err
		}
		if tag.RowsAffected() == 0 {
			return errors.New("unknown permission: " + key)
		}
	}

	_, err = tx.Exec(ctx, `UPDATE roles SET updated_at = now() WHERE id = $1`, roleID)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}
