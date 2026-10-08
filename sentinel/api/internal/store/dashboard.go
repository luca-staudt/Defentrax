package store

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardStats struct {
	ServersTotal       int            `json:"servers_total"`
	AgentsActive       int            `json:"agents_active"`
	EventsLast24h      int            `json:"events_last_24h"`
	AlertsOpen         int            `json:"alerts_open"`
	AlertsByStatus     map[string]int `json:"alerts_by_status"`
	AlertsBySeverity   map[string]int `json:"alerts_by_severity"`
	EventsBySeverity   map[string]int `json:"events_by_severity_24h"`
	HostsSilent        int            `json:"hosts_silent"`
	HostsSilentMinutes int            `json:"hosts_silent_minutes"`
}

func DashboardStatsQuery(ctx context.Context, pool *pgxpool.Pool) (DashboardStats, error) {
	since := time.Now().UTC().Add(-24 * time.Hour)
	silentBefore := time.Now().UTC().Add(-SilentHostAfter)
	var s DashboardStats
	var byStatus, bySeverity, eventsBySeverity []byte
	err := pool.QueryRow(ctx, `
		SELECT
			(SELECT COUNT(*) FROM servers),
			(SELECT COUNT(*) FROM agents WHERE status = 'active'),
			(SELECT COUNT(*) FROM events WHERE received_at >= $1),
			(SELECT COUNT(*) FROM alerts WHERE status <> 'RESOLVED'),
			(SELECT COUNT(*) FROM servers s
				WHERE EXISTS (
					SELECT 1 FROM agents a WHERE a.server_id = s.id AND a.status <> 'revoked'
				)
				AND NOT EXISTS (
					SELECT 1 FROM agents a
					WHERE a.server_id = s.id AND a.status <> 'revoked' AND a.last_heartbeat_at >= $2
				)
				AND NOT EXISTS (
					SELECT 1 FROM events e WHERE e.server_id = s.id AND e.received_at >= $2
				)
			),
			COALESCE((
				SELECT jsonb_object_agg(status, n)
				FROM (SELECT status, COUNT(*)::int AS n FROM alerts GROUP BY status) grouped
			), '{}'::jsonb),
			COALESCE((
				SELECT jsonb_object_agg(severity, n)
				FROM (
					SELECT severity, COUNT(*)::int AS n
					FROM alerts
					WHERE status <> 'RESOLVED'
					GROUP BY severity
				) grouped
			), '{}'::jsonb),
			COALESCE((
				SELECT jsonb_object_agg(severity, n)
				FROM (
					SELECT severity, COUNT(*)::int AS n
					FROM events
					WHERE received_at >= $1
					GROUP BY severity
				) grouped
			), '{}'::jsonb)
	`, since, silentBefore).Scan(
		&s.ServersTotal,
		&s.AgentsActive,
		&s.EventsLast24h,
		&s.AlertsOpen,
		&s.HostsSilent,
		&byStatus,
		&bySeverity,
		&eventsBySeverity,
	)
	if err != nil {
		return s, err
	}
	s.HostsSilentMinutes = int(SilentHostAfter / time.Minute)
	s.AlertsByStatus = map[string]int{}
	s.AlertsBySeverity = map[string]int{}
	s.EventsBySeverity = map[string]int{}
	if err := json.Unmarshal(byStatus, &s.AlertsByStatus); err != nil {
		return s, err
	}
	if err := json.Unmarshal(bySeverity, &s.AlertsBySeverity); err != nil {
		return s, err
	}
	if err := json.Unmarshal(eventsBySeverity, &s.EventsBySeverity); err != nil {
		return s, err
	}
	return s, nil
}
