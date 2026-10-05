package store

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type EventRow struct {
	ID         uuid.UUID
	AgentID    uuid.UUID
	ServerID   uuid.UUID
	ReceivedAt time.Time
	OccurredAt time.Time
	Source     string
	Category   string
	Severity   string
	Host       string
	Message    string
	IngestID   string
}

type EventListFilter struct {
	ServerID uuid.UUID
	Severity string
	Source   string
	Category string
	Search   string
	Since    *time.Time
	Until    *time.Time
	Limit    int
	Offset   int
}

func ListEvents(ctx context.Context, pool *pgxpool.Pool, f EventListFilter) ([]EventRow, int, error) {
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

	if f.ServerID != uuid.Nil {
		where = append(where, fmt.Sprintf("server_id = $%d", argN))
		args = append(args, f.ServerID)
		argN++
	}
	if f.Severity != "" {
		where = append(where, fmt.Sprintf("severity = $%d", argN))
		args = append(args, f.Severity)
		argN++
	}
	if f.Source != "" {
		where = append(where, fmt.Sprintf("source = $%d", argN))
		args = append(args, f.Source)
		argN++
	}
	if f.Category != "" {
		where = append(where, fmt.Sprintf("category = $%d", argN))
		args = append(args, f.Category)
		argN++
	}
	if f.Search != "" {
		where = append(where, fmt.Sprintf("message ILIKE $%d", argN))
		args = append(args, "%"+strings.ReplaceAll(f.Search, "%", "")+"%")
		argN++
	}
	if f.Since != nil {
		where = append(where, fmt.Sprintf("received_at >= $%d", argN))
		args = append(args, *f.Since)
		argN++
	}
	if f.Until != nil {
		where = append(where, fmt.Sprintf("received_at <= $%d", argN))
		args = append(args, *f.Until)
		argN++
	}

	whereSQL := strings.Join(where, " AND ")

	var total int
	countQ := fmt.Sprintf(`SELECT COUNT(*) FROM events WHERE %s`, whereSQL)
	if err := pool.QueryRow(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	listQ := fmt.Sprintf(`
		SELECT id, agent_id, server_id, received_at, occurred_at, source, category, severity, host, message, ingest_id
		FROM events WHERE %s
		ORDER BY received_at DESC
		LIMIT $%d OFFSET $%d
	`, whereSQL, argN, argN+1)
	args = append(args, limit, offset)

	rows, err := pool.Query(ctx, listQ, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []EventRow
	for rows.Next() {
		var e EventRow
		if err := rows.Scan(&e.ID, &e.AgentID, &e.ServerID, &e.ReceivedAt, &e.OccurredAt, &e.Source, &e.Category, &e.Severity, &e.Host, &e.Message, &e.IngestID); err != nil {
			return nil, 0, err
		}
		out = append(out, e)
	}
	return out, total, rows.Err()
}

func GetEventByID(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (EventRow, error) {
	var e EventRow
	err := pool.QueryRow(ctx, `
		SELECT id, agent_id, server_id, received_at, occurred_at, source, category, severity, host, message, ingest_id
		FROM events WHERE id = $1
	`, id).Scan(&e.ID, &e.AgentID, &e.ServerID, &e.ReceivedAt, &e.OccurredAt, &e.Source, &e.Category, &e.Severity, &e.Host, &e.Message, &e.IngestID)
	if errors.Is(err, pgx.ErrNoRows) {
		return EventRow{}, ErrNotFound
	}
	return e, err
}
