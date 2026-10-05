package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Audit writes an audit_logs row. Metadata must not contain secrets.
func Audit(ctx context.Context, pool *pgxpool.Pool, actorUserID *uuid.UUID, actorType, action, entityType string, entityID *uuid.UUID, metadata map[string]any, ip net.IP, userAgent string) error {
	var meta []byte
	if metadata != nil {
		b, err := json.Marshal(metadata)
		if err != nil {
			return err
		}
		meta = b
	} else {
		meta = []byte("{}")
	}
	var ipVal any
	if ip != nil {
		ipVal = ip.String()
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, metadata, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
	`, actorUserID, actorType, action, entityType, entityID, meta, ipVal, userAgent)
	return err
}

// AuditLogRow is a read model for the admin audit UI.
type AuditLogRow struct {
	ID          uuid.UUID
	ActorUserID *uuid.UUID
	ActorEmail  string
	ActorType   string
	Action      string
	EntityType  string
	EntityID    *uuid.UUID
	Metadata    json.RawMessage
	IPAddress   string
	UserAgent   string
	CreatedAt   time.Time
}

// AuditListFilter controls listing with pagination and filters.
type AuditListFilter struct {
	Action      string
	ActorUserID uuid.UUID
	ActorEmail  string // partial ILIKE match on users.email
	Search      string // matches action / entity_type / actor email
	Since       *time.Time
	Until       *time.Time
	Limit       int
	Offset      int
}

// ListAuditLogs returns newest-first audit rows with optional filters.
func ListAuditLogs(ctx context.Context, pool *pgxpool.Pool, f AuditListFilter) ([]AuditLogRow, int, error) {
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	where := []string{"1=1"}
	args := []any{}
	argN := 1

	if f.Action != "" {
		where = append(where, fmt.Sprintf("a.action = $%d", argN))
		args = append(args, f.Action)
		argN++
	}
	if f.ActorUserID != uuid.Nil {
		where = append(where, fmt.Sprintf("a.actor_user_id = $%d", argN))
		args = append(args, f.ActorUserID)
		argN++
	}
	if f.ActorEmail != "" {
		where = append(where, fmt.Sprintf("u.email ILIKE $%d", argN))
		args = append(args, "%"+strings.ReplaceAll(f.ActorEmail, "%", "")+"%")
		argN++
	}
	if f.Search != "" {
		where = append(where, fmt.Sprintf(
			"(a.action ILIKE $%d OR a.entity_type ILIKE $%d OR COALESCE(u.email, '') ILIKE $%d)",
			argN, argN, argN,
		))
		args = append(args, "%"+strings.ReplaceAll(f.Search, "%", "")+"%")
		argN++
	}
	if f.Since != nil {
		where = append(where, fmt.Sprintf("a.created_at >= $%d", argN))
		args = append(args, *f.Since)
		argN++
	}
	if f.Until != nil {
		where = append(where, fmt.Sprintf("a.created_at <= $%d", argN))
		args = append(args, *f.Until)
		argN++
	}

	whereSQL := strings.Join(where, " AND ")

	var total int
	countQ := fmt.Sprintf(`
		SELECT COUNT(*)
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
		WHERE %s
	`, whereSQL)
	if err := pool.QueryRow(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listQ := fmt.Sprintf(`
		SELECT a.id, a.actor_user_id, COALESCE(u.email, ''), a.actor_type, a.action, a.entity_type,
		       a.entity_id, a.metadata, COALESCE(a.ip_address::text, ''), a.user_agent, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
		WHERE %s
		ORDER BY a.created_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argN, argN+1)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, listQ, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	out := make([]AuditLogRow, 0)
	for rows.Next() {
		var r AuditLogRow
		var meta []byte
		if err := rows.Scan(
			&r.ID, &r.ActorUserID, &r.ActorEmail, &r.ActorType, &r.Action, &r.EntityType,
			&r.EntityID, &meta, &r.IPAddress, &r.UserAgent, &r.CreatedAt,
		); err != nil {
			return nil, 0, err
		}
		if len(meta) == 0 {
			meta = []byte("{}")
		}
		r.Metadata = meta
		out = append(out, r)
	}
	return out, total, rows.Err()
}

// GetAuditLog returns one audit row by id.
func GetAuditLog(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (AuditLogRow, error) {
	var r AuditLogRow
	var meta []byte
	err := pool.QueryRow(ctx, `
		SELECT a.id, a.actor_user_id, COALESCE(u.email, ''), a.actor_type, a.action, a.entity_type,
		       a.entity_id, a.metadata, COALESCE(a.ip_address::text, ''), a.user_agent, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
		WHERE a.id = $1
	`, id).Scan(
		&r.ID, &r.ActorUserID, &r.ActorEmail, &r.ActorType, &r.Action, &r.EntityType,
		&r.EntityID, &meta, &r.IPAddress, &r.UserAgent, &r.CreatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AuditLogRow{}, ErrNotFound
		}
		return AuditLogRow{}, err
	}
	if len(meta) == 0 {
		meta = []byte("{}")
	}
	r.Metadata = meta
	return r, nil
}
