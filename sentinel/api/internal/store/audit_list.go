package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AuditLogRow is a persisted audit trail entry for admin UI listing.
type AuditLogRow struct {
	ID           uuid.UUID
	ActorUserID  *uuid.UUID
	ActorEmail   string
	ActorType    string
	Action       string
	EntityType   string
	EntityID     *uuid.UUID
	Metadata     json.RawMessage
	IPAddress    string
	UserAgent    string
	CreatedAt    time.Time
}

// AuditListFilter controls pagination and filtering for audit logs.
type AuditListFilter struct {
	Action    string
	Actor     string // matches actor email (ILIKE) or actor_user_id UUID
	ActorType string
	Since     *time.Time
	Until     *time.Time
	Limit     int
	Offset    int
}

// ListAuditLogs returns paginated audit rows (newest first) with optional actor email.
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
	if f.ActorType != "" {
		where = append(where, fmt.Sprintf("a.actor_type = $%d", argN))
		args = append(args, f.ActorType)
		argN++
	}
	if f.Actor != "" {
		actor := strings.TrimSpace(f.Actor)
		if id, err := uuid.Parse(actor); err == nil {
			where = append(where, fmt.Sprintf("a.actor_user_id = $%d", argN))
			args = append(args, id)
			argN++
		} else {
			where = append(where, fmt.Sprintf("u.email ILIKE $%d", argN))
			args = append(args, "%"+strings.ReplaceAll(actor, "%", "")+"%")
			argN++
		}
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
		SELECT a.id, a.actor_user_id, COALESCE(u.email, ''), a.actor_type, a.action,
		       a.entity_type, a.entity_id, a.metadata, COALESCE(host(a.ip_address)::text, ''),
		       a.user_agent, a.created_at
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

	var out []AuditLogRow
	for rows.Next() {
		var r AuditLogRow
		var meta []byte
		if err := rows.Scan(
			&r.ID, &r.ActorUserID, &r.ActorEmail, &r.ActorType, &r.Action,
			&r.EntityType, &r.EntityID, &meta, &r.IPAddress, &r.UserAgent, &r.CreatedAt,
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

// GetAuditLog returns a single audit log by id.
func GetAuditLog(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (AuditLogRow, error) {
	var r AuditLogRow
	var meta []byte
	err := pool.QueryRow(ctx, `
		SELECT a.id, a.actor_user_id, COALESCE(u.email, ''), a.actor_type, a.action,
		       a.entity_type, a.entity_id, a.metadata, COALESCE(host(a.ip_address)::text, ''),
		       a.user_agent, a.created_at
		FROM audit_logs a
		LEFT JOIN users u ON u.id = a.actor_user_id
		WHERE a.id = $1
	`, id).Scan(
		&r.ID, &r.ActorUserID, &r.ActorEmail, &r.ActorType, &r.Action,
		&r.EntityType, &r.EntityID, &meta, &r.IPAddress, &r.UserAgent, &r.CreatedAt,
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
