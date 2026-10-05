package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var ErrNotFound = errors.New("not found")

type User struct {
	ID           uuid.UUID
	Email        string
	PasswordHash string
	DisplayName  string
	IsActive     bool
	LastLoginAt  *time.Time
}

type UserPublic struct {
	ID          uuid.UUID `json:"id"`
	Email       string    `json:"email"`
	DisplayName string    `json:"display_name"`
	IsActive    bool      `json:"is_active"`
	Roles       []string  `json:"roles,omitempty"`
}

func CountUsers(ctx context.Context, pool *pgxpool.Pool) (int64, error) {
	var n int64
	err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM users`).Scan(&n)
	return n, err
}

func GetUserByEmail(ctx context.Context, pool *pgxpool.Pool, email string) (User, error) {
	var u User
	err := pool.QueryRow(ctx, `
		SELECT id, email, password_hash, display_name, is_active, last_login_at
		FROM users WHERE lower(email) = lower($1)
	`, email).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.IsActive, &u.LastLoginAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func GetUserByID(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (User, error) {
	var u User
	err := pool.QueryRow(ctx, `
		SELECT id, email, password_hash, display_name, is_active, last_login_at
		FROM users WHERE id = $1
	`, id).Scan(&u.ID, &u.Email, &u.PasswordHash, &u.DisplayName, &u.IsActive, &u.LastLoginAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return User{}, ErrNotFound
	}
	return u, err
}

func CreateUser(ctx context.Context, pool *pgxpool.Pool, email, passwordHash, displayName string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO users (email, password_hash, display_name)
		VALUES ($1, $2, $3)
		RETURNING id
	`, email, passwordHash, displayName).Scan(&id)
	return id, err
}

func SetUserRoles(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, roleNames []string, assignedBy *uuid.UUID) error {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	_, err = tx.Exec(ctx, `DELETE FROM user_roles WHERE user_id = $1`, userID)
	if err != nil {
		return err
	}
	for _, name := range roleNames {
		_, err = tx.Exec(ctx, `
			INSERT INTO user_roles (user_id, role_id, assigned_by)
			SELECT $1, id, $2 FROM roles WHERE name = $3
		`, userID, assignedBy, name)
		if err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func ListUserRoles(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) ([]string, error) {
	rows, err := pool.Query(ctx, `
		SELECT r.name FROM user_roles ur
		JOIN roles r ON r.id = ur.role_id
		WHERE ur.user_id = $1
		ORDER BY r.name
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var roles []string
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		roles = append(roles, name)
	}
	return roles, rows.Err()
}

func ListPermissionsForUser(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) ([]string, error) {
	rows, err := pool.Query(ctx, `
		SELECT DISTINCT p.resource, p.action
		FROM user_roles ur
		JOIN role_permissions rp ON rp.role_id = ur.role_id
		JOIN permissions p ON p.id = rp.permission_id
		WHERE ur.user_id = $1
		ORDER BY p.resource, p.action
	`, userID)
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

func ListUsers(ctx context.Context, pool *pgxpool.Pool) ([]UserPublic, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, email, display_name, is_active FROM users ORDER BY email
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var users []UserPublic
	for rows.Next() {
		var u UserPublic
		if err := rows.Scan(&u.ID, &u.Email, &u.DisplayName, &u.IsActive); err != nil {
			return nil, err
		}
		roles, err := ListUserRoles(ctx, pool, u.ID)
		if err != nil {
			return nil, err
		}
		u.Roles = roles
		users = append(users, u)
	}
	return users, rows.Err()
}

func TouchLastLogin(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) error {
	_, err := pool.Exec(ctx, `UPDATE users SET last_login_at = now(), updated_at = now() WHERE id = $1`, userID)
	return err
}

func RoleIDByName(ctx context.Context, pool *pgxpool.Pool, name string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `SELECT id FROM roles WHERE name = $1`, name).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, ErrNotFound
	}
	return id, err
}
