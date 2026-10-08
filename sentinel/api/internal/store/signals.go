package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ServerSignal is a fleet row plus quiet-state and liveness.
type ServerSignal struct {
	Server
	SilencedUntil   *time.Time
	LastHeartbeatAt *time.Time
	LastEventAt     *time.Time
	AgentCount      int
	Silent          bool
}

func ListServerSignals(ctx context.Context, pool *pgxpool.Pool, silentBefore time.Time) ([]ServerSignal, error) {
	rows, err := pool.Query(ctx, `
SELECT s.id, s.name, s.hostname, s.created_at,
       sil.until_at,
       (SELECT MAX(a.last_heartbeat_at) FROM agents a WHERE a.server_id = s.id AND a.status <> 'revoked'),
       (SELECT MAX(e.received_at) FROM events e WHERE e.server_id = s.id),
       (SELECT COUNT(*) FROM agents a WHERE a.server_id = s.id AND a.status <> 'revoked')
FROM servers s
LEFT JOIN silences sil
  ON sil.target_kind = 'server' AND sil.target_id = s.id AND sil.until_at > now()
ORDER BY s.name
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ServerSignal
	for rows.Next() {
		var row ServerSignal
		if err := rows.Scan(
			&row.ID, &row.Name, &row.Hostname, &row.CreatedAt,
			&row.SilencedUntil, &row.LastHeartbeatAt, &row.LastEventAt, &row.AgentCount,
		); err != nil {
			return nil, err
		}
		row.Silent = hostIsSilent(row.AgentCount, row.LastHeartbeatAt, row.LastEventAt, silentBefore)
		out = append(out, row)
	}
	return out, rows.Err()
}

func ServerSignalByID(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, silentBefore time.Time) (ServerSignal, error) {
	var row ServerSignal
	err := pool.QueryRow(ctx, `
SELECT s.id, s.name, s.hostname, s.created_at,
       sil.until_at,
       (SELECT MAX(a.last_heartbeat_at) FROM agents a WHERE a.server_id = s.id AND a.status <> 'revoked'),
       (SELECT MAX(e.received_at) FROM events e WHERE e.server_id = s.id),
       (SELECT COUNT(*) FROM agents a WHERE a.server_id = s.id AND a.status <> 'revoked')
FROM servers s
LEFT JOIN silences sil
  ON sil.target_kind = 'server' AND sil.target_id = s.id AND sil.until_at > now()
WHERE s.id = $1
`, id).Scan(
		&row.ID, &row.Name, &row.Hostname, &row.CreatedAt,
		&row.SilencedUntil, &row.LastHeartbeatAt, &row.LastEventAt, &row.AgentCount,
	)
	if errors.Is(err, pgx.ErrNoRows) {
		return ServerSignal{}, ErrNotFound
	}
	if err != nil {
		return ServerSignal{}, err
	}
	row.Silent = hostIsSilent(row.AgentCount, row.LastHeartbeatAt, row.LastEventAt, silentBefore)
	return row, nil
}

func hostIsSilent(agents int, heartbeat, lastEvent *time.Time, silentBefore time.Time) bool {
	if agents == 0 {
		return false
	}
	heartbeatStale := heartbeat == nil || heartbeat.Before(silentBefore)
	eventStale := lastEvent == nil || lastEvent.Before(silentBefore)
	return heartbeatStale && eventStale
}
