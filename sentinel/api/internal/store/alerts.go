package store

import (
	"context"
	"encoding/json"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// AlertInsert creates a minimal OPEN alert (Phase 8 will extend lifecycle/dedup).
type AlertInsert struct {
	ServerID    uuid.UUID
	RuleID      uuid.UUID
	Title       string
	Description string
	Severity    string
	EventID     uuid.UUID
}

// InsertAlert stores a new OPEN alert linked to a rule.
func InsertAlert(ctx context.Context, pool *pgxpool.Pool, a AlertInsert) (uuid.UUID, error) {
	var id uuid.UUID
	meta := map[string]any{}
	if a.EventID != uuid.Nil {
		meta["event_id"] = a.EventID.String()
	}
	metaJSON, err := json.Marshal(meta)
	if err != nil {
		return uuid.Nil, err
	}
	err = pool.QueryRow(ctx, `
INSERT INTO alerts (server_id, rule_id, title, description, status, severity, metadata)
VALUES ($1, $2, $3, $4, 'OPEN', $5, $6::jsonb)
RETURNING id
`, a.ServerID, nullableUUID(a.RuleID), a.Title, a.Description, a.Severity, string(metaJSON)).Scan(&id)
	return id, err
}

func nullableUUID(id uuid.UUID) any {
	if id == uuid.Nil {
		return nil
	}
	return id
}
