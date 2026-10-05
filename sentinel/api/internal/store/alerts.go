package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Alert row from alerts table (Phase 8).
type Alert struct {
	ID              uuid.UUID
	ServerID        uuid.UUID
	RuleID          uuid.UUID
	AssignedTo      *uuid.UUID
	Title           string
	Description     string
	Status          string
	Severity        string
	DedupKey        string
	SourceIP        string
	EventCount      int
	FirstSeenAt     time.Time
	LastSeenAt      time.Time
	ResolutionNotes string
	OpenedAt        time.Time
	AcknowledgedAt  *time.Time
	InvestigatingAt *time.Time
	ResolvedAt      *time.Time
	Metadata        json.RawMessage
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

type AlertTimelineEvent struct {
	ID          uuid.UUID
	AlertID     uuid.UUID
	ActorUserID *uuid.UUID
	EventType   string
	Message     string
	Metadata    json.RawMessage
	CreatedAt   time.Time
}

type AlertListFilter struct {
	Status   string
	Severity string
	ServerID uuid.UUID
	Limit    int
	Offset   int
}

type AlertCreateParams struct {
	ServerID    uuid.UUID
	RuleID      uuid.UUID
	Title       string
	Description string
	Severity    string
	DedupKey    string
	SourceIP    string
	EventID     uuid.UUID
	OccurredAt  time.Time
}

// CreateAlert inserts a new OPEN alert and a created timeline row.
func CreateAlert(ctx context.Context, pool *pgxpool.Pool, p AlertCreateParams) (uuid.UUID, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return uuid.Nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	meta := map[string]any{}
	if p.EventID != uuid.Nil {
		meta["trigger_event_id"] = p.EventID.String()
	}
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return uuid.Nil, err
	}

	firstSeen := p.OccurredAt
	if firstSeen.IsZero() {
		firstSeen = time.Now().UTC()
	}

	var id uuid.UUID
	err = tx.QueryRow(ctx, `
INSERT INTO alerts (
    server_id, rule_id, title, description, status, severity,
    dedup_key, source_ip, event_count, first_seen_at, last_seen_at, metadata
)
VALUES ($1, $2, $3, $4, 'OPEN', $5, $6, $7, 1, $8, $8, $9::jsonb)
RETURNING id
`, p.ServerID, nullableUUID(p.RuleID), p.Title, p.Description, p.Severity,
		p.DedupKey, p.SourceIP, firstSeen, string(metaJSON)).Scan(&id)
	if err != nil {
		return uuid.Nil, err
	}

	if p.RuleID != uuid.Nil {
		_, err = tx.Exec(ctx, `
INSERT INTO alert_rules (alert_id, rule_id) VALUES ($1, $2)
ON CONFLICT DO NOTHING
`, id, p.RuleID)
		if err != nil {
			return uuid.Nil, err
		}
	}

	if err := insertTimeline(ctx, tx, id, nil, "created", "Alert opened from detection match", map[string]any{
		"event_count": 1,
	}); err != nil {
		return uuid.Nil, err
	}

	if err := tx.Commit(ctx); err != nil {
		return uuid.Nil, err
	}
	return id, nil
}

// GetActiveAlertByDedupKey returns a non-resolved alert for the dedup key, if any.
func GetActiveAlertByDedupKey(ctx context.Context, pool *pgxpool.Pool, dedupKey string) (*Alert, error) {
	if dedupKey == "" {
		return nil, nil
	}
	row := pool.QueryRow(ctx, `
SELECT id, server_id, rule_id, assigned_to, title, description, status, severity,
       dedup_key, source_ip, event_count, first_seen_at, last_seen_at, resolution_notes,
       opened_at, acknowledged_at, investigating_at, resolved_at, metadata, created_at, updated_at
FROM alerts
WHERE dedup_key = $1 AND status <> 'RESOLVED'
ORDER BY opened_at DESC
LIMIT 1
`, dedupKey)
	a, err := scanAlert(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

// AggregateAlert increments event_count and updates last_seen_at.
func AggregateAlert(ctx context.Context, pool *pgxpool.Pool, alertID uuid.UUID, lastSeen time.Time, triggerEventID uuid.UUID) error {
	if lastSeen.IsZero() {
		lastSeen = time.Now().UTC()
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	var count int
	err = tx.QueryRow(ctx, `
UPDATE alerts
SET event_count = event_count + 1,
    last_seen_at = $2,
    updated_at = now()
WHERE id = $1
RETURNING event_count
`, alertID, lastSeen).Scan(&count)
	if err != nil {
		return err
	}

	meta := map[string]any{"event_count": count}
	if triggerEventID != uuid.Nil {
		meta["trigger_event_id"] = triggerEventID.String()
	}
	if err := insertTimeline(ctx, tx, alertID, nil, "aggregated", "Additional matching events aggregated", meta); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func GetAlertByID(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (*Alert, error) {
	row := pool.QueryRow(ctx, `
SELECT id, server_id, rule_id, assigned_to, title, description, status, severity,
       dedup_key, source_ip, event_count, first_seen_at, last_seen_at, resolution_notes,
       opened_at, acknowledged_at, investigating_at, resolved_at, metadata, created_at, updated_at
FROM alerts WHERE id = $1
`, id)
	a, err := scanAlert(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func ListAlerts(ctx context.Context, pool *pgxpool.Pool, f AlertListFilter) ([]Alert, int, error) {
	limit := f.Limit
	if limit < 1 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}

	args := []any{}
	where := "WHERE 1=1"
	n := 1
	if f.Status != "" {
		where += fmt.Sprintf(" AND status = $%d", n)
		args = append(args, f.Status)
		n++
	}
	if f.Severity != "" {
		where += fmt.Sprintf(" AND severity = $%d", n)
		args = append(args, f.Severity)
		n++
	}
	if f.ServerID != uuid.Nil {
		where += fmt.Sprintf(" AND server_id = $%d", n)
		args = append(args, f.ServerID)
		n++
	}

	var total int
	countQ := "SELECT COUNT(*) FROM alerts " + where
	if err := pool.QueryRow(ctx, countQ, args...).Scan(&total); err != nil {
		return nil, 0, err
	}

	args = append(args, limit, offset)
	listQ := `
SELECT id, server_id, rule_id, assigned_to, title, description, status, severity,
       dedup_key, source_ip, event_count, first_seen_at, last_seen_at, resolution_notes,
       opened_at, acknowledged_at, investigating_at, resolved_at, metadata, created_at, updated_at
FROM alerts ` + where + fmt.Sprintf(`
ORDER BY opened_at DESC
LIMIT $%d OFFSET $%d`, n, n+1)

	rows, err := pool.Query(ctx, listQ, args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()

	var out []Alert
	for rows.Next() {
		a, err := scanAlert(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

type AlertStatusUpdate struct {
	Status          string
	ResolutionNotes string
	AssignedTo      *uuid.UUID
	ActorUserID     *uuid.UUID
}

// UpdateAlertLifecycle applies status and/or assignment changes with timeline + timestamps.
func UpdateAlertLifecycle(ctx context.Context, pool *pgxpool.Pool, alertID uuid.UUID, upd AlertStatusUpdate) (*Alert, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback(ctx) }()

	current, err := getAlertForUpdate(ctx, tx, alertID)
	if err != nil {
		return nil, err
	}

	now := time.Now().UTC()
	status := current.Status
	if upd.Status != "" && upd.Status != current.Status {
		status = upd.Status
	}

	assignChanged := false
	var assigned *uuid.UUID
	if upd.AssignedTo != nil {
		assignChanged = !uuidEqual(current.AssignedTo, upd.AssignedTo)
		assigned = upd.AssignedTo
	} else {
		assigned = current.AssignedTo
	}

	resNotes := current.ResolutionNotes
	if upd.ResolutionNotes != "" {
		resNotes = upd.ResolutionNotes
	}

	var ackAt, invAt, resAt *time.Time
	ackAt = current.AcknowledgedAt
	invAt = current.InvestigatingAt
	resAt = current.ResolvedAt

	switch status {
	case "ACKNOWLEDGED":
		if ackAt == nil {
			t := now
			ackAt = &t
		}
	case "INVESTIGATING":
		if invAt == nil {
			t := now
			invAt = &t
		}
	case "RESOLVED":
		if resAt == nil {
			t := now
			resAt = &t
		}
	}

	_, err = tx.Exec(ctx, `
UPDATE alerts SET
    status = $2,
    assigned_to = $3,
    resolution_notes = $4,
    acknowledged_at = $5,
    investigating_at = $6,
    resolved_at = $7,
    updated_at = now()
WHERE id = $1
`, alertID, status, nullableUUIDPtr(assigned), resNotes, ackAt, invAt, resAt)
	if err != nil {
		return nil, err
	}

	if upd.Status != "" && upd.Status != current.Status {
		msg := fmt.Sprintf("Status changed to %s", upd.Status)
		if err := insertTimeline(ctx, tx, alertID, upd.ActorUserID, timelineTypeForStatus(upd.Status), msg, map[string]any{
			"from_status": current.Status,
			"to_status":   upd.Status,
		}); err != nil {
			return nil, err
		}
	}
	if assignChanged {
		meta := map[string]any{}
		if assigned != nil {
			meta["assigned_to"] = assigned.String()
		} else {
			meta["assigned_to"] = nil
		}
		if err := insertTimeline(ctx, tx, alertID, upd.ActorUserID, "assigned", "Alert assignment updated", meta); err != nil {
			return nil, err
		}
	}

	if err := tx.Commit(ctx); err != nil {
		return nil, err
	}
	return GetAlertByID(ctx, pool, alertID)
}

func ListAlertTimeline(ctx context.Context, pool *pgxpool.Pool, alertID uuid.UUID) ([]AlertTimelineEvent, error) {
	rows, err := pool.Query(ctx, `
SELECT id, alert_id, actor_user_id, event_type, message, metadata, created_at
FROM alert_timeline_events
WHERE alert_id = $1
ORDER BY created_at ASC
`, alertID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []AlertTimelineEvent
	for rows.Next() {
		var e AlertTimelineEvent
		var meta []byte
		var actor *uuid.UUID
		if err := rows.Scan(&e.ID, &e.AlertID, &actor, &e.EventType, &e.Message, &meta, &e.CreatedAt); err != nil {
			return nil, err
		}
		e.ActorUserID = actor
		e.Metadata = meta
		out = append(out, e)
	}
	return out, rows.Err()
}

func getAlertForUpdate(ctx context.Context, tx pgx.Tx, id uuid.UUID) (*Alert, error) {
	row := tx.QueryRow(ctx, `
SELECT id, server_id, rule_id, assigned_to, title, description, status, severity,
       dedup_key, source_ip, event_count, first_seen_at, last_seen_at, resolution_notes,
       opened_at, acknowledged_at, investigating_at, resolved_at, metadata, created_at, updated_at
FROM alerts WHERE id = $1 FOR UPDATE
`, id)
	a, err := scanAlert(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, err
	}
	return &a, nil
}

func scanAlert(row pgx.Row) (Alert, error) {
	var a Alert
	var serverID, ruleID *uuid.UUID
	var meta []byte
	err := row.Scan(
		&a.ID, &serverID, &ruleID, &a.AssignedTo, &a.Title, &a.Description, &a.Status, &a.Severity,
		&a.DedupKey, &a.SourceIP, &a.EventCount, &a.FirstSeenAt, &a.LastSeenAt, &a.ResolutionNotes,
		&a.OpenedAt, &a.AcknowledgedAt, &a.InvestigatingAt, &a.ResolvedAt, &meta, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return Alert{}, err
	}
	if serverID != nil {
		a.ServerID = *serverID
	}
	if ruleID != nil {
		a.RuleID = *ruleID
	}
	a.Metadata = meta
	return a, nil
}

func insertTimeline(ctx context.Context, tx pgx.Tx, alertID uuid.UUID, actor *uuid.UUID, eventType, message string, metadata map[string]any) error {
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
	_, err := tx.Exec(ctx, `
INSERT INTO alert_timeline_events (alert_id, actor_user_id, event_type, message, metadata)
VALUES ($1, $2, $3, $4, $5::jsonb)
`, alertID, actor, eventType, message, string(meta))
	return err
}

func timelineTypeForStatus(status string) string {
	switch status {
	case "ACKNOWLEDGED":
		return "acknowledged"
	case "INVESTIGATING":
		return "investigating"
	case "RESOLVED":
		return "resolved"
	default:
		return "status_changed"
	}
}

func uuidEqual(a, b *uuid.UUID) bool {
	if a == nil && b == nil {
		return true
	}
	if a == nil || b == nil {
		return false
	}
	return *a == *b
}

func nullableUUIDPtr(id *uuid.UUID) any {
	if id == nil || *id == uuid.Nil {
		return nil
	}
	return *id
}

// Deprecated: use CreateAlert via alert manager. Kept for compatibility during migration.
type AlertInsert struct {
	ServerID    uuid.UUID
	RuleID      uuid.UUID
	Title       string
	Description string
	Severity    string
	EventID     uuid.UUID
}

func nullableUUID(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}

func InsertAlert(ctx context.Context, pool *pgxpool.Pool, a AlertInsert) (uuid.UUID, error) {
	return CreateAlert(ctx, pool, AlertCreateParams{
		ServerID:    a.ServerID,
		RuleID:      a.RuleID,
		Title:       a.Title,
		Description: a.Description,
		Severity:    a.Severity,
		EventID:     a.EventID,
		OccurredAt:  time.Now().UTC(),
	})
}
