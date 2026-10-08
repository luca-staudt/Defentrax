package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// SilentHostAfter is how long a host may go without a heartbeat and without an event
// before the fleet marks it silent.
const SilentHostAfter = 15 * time.Minute

func UpsertSilence(ctx context.Context, pool *pgxpool.Pool, kind string, targetID uuid.UUID, until time.Time, actor *uuid.UUID) error {
	_, err := pool.Exec(ctx, `
INSERT INTO silences (target_kind, target_id, until_at, created_by)
VALUES ($1, $2, $3, $4)
ON CONFLICT (target_kind, target_id) DO UPDATE
SET until_at = EXCLUDED.until_at, created_by = EXCLUDED.created_by, created_at = now()
`, kind, targetID, until.UTC(), actor)
	return err
}

func DeleteSilence(ctx context.Context, pool *pgxpool.Pool, kind string, targetID uuid.UUID) error {
	_, err := pool.Exec(ctx, `DELETE FROM silences WHERE target_kind = $1 AND target_id = $2`, kind, targetID)
	return err
}

func ListSilences(ctx context.Context, pool *pgxpool.Pool, kind string) (map[uuid.UUID]time.Time, error) {
	rows, err := pool.Query(ctx, `
SELECT target_id, until_at FROM silences
WHERE target_kind = $1 AND until_at > now()
`, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[uuid.UUID]time.Time{}
	for rows.Next() {
		var id uuid.UUID
		var until time.Time
		if err := rows.Scan(&id, &until); err != nil {
			return nil, err
		}
		out[id] = until
	}
	return out, rows.Err()
}

// SilenceActive reports whether a rule or its server is inside a maintenance window.
func SilenceActive(ctx context.Context, pool *pgxpool.Pool, ruleID, serverID uuid.UUID) (bool, error) {
	var active bool
	err := pool.QueryRow(ctx, `
SELECT EXISTS (
    SELECT 1 FROM silences WHERE target_kind = 'rule' AND target_id = $1 AND until_at > now()
) OR EXISTS (
    SELECT 1 FROM silences WHERE target_kind = 'server' AND target_id = $2 AND until_at > now()
)
`, ruleID, serverID).Scan(&active)
	return active, err
}
