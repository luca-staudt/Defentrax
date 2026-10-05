package store

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

type DashboardStats struct {
	ServersTotal     int            `json:"servers_total"`
	AgentsActive     int            `json:"agents_active"`
	EventsLast24h    int            `json:"events_last_24h"`
	AlertsOpen       int            `json:"alerts_open"`
	AlertsByStatus   map[string]int `json:"alerts_by_status"`
	AlertsBySeverity map[string]int `json:"alerts_by_severity"`
	EventsBySeverity map[string]int `json:"events_by_severity_24h"`
}

func DashboardStatsQuery(ctx context.Context, pool *pgxpool.Pool) (DashboardStats, error) {
	var s DashboardStats
	s.AlertsByStatus = make(map[string]int)
	s.AlertsBySeverity = make(map[string]int)
	s.EventsBySeverity = make(map[string]int)

	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM servers`).Scan(&s.ServersTotal); err != nil {
		return s, err
	}
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM agents WHERE status = 'active'`).Scan(&s.AgentsActive); err != nil {
		return s, err
	}

	since := time.Now().UTC().Add(-24 * time.Hour)
	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM events WHERE received_at >= $1`, since).Scan(&s.EventsLast24h); err != nil {
		return s, err
	}

	if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM alerts WHERE status NOT IN ('RESOLVED')`).Scan(&s.AlertsOpen); err != nil {
		return s, err
	}

	rows, err := pool.Query(ctx, `SELECT status, COUNT(*) FROM alerts GROUP BY status`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var status string
		var n int
		if err := rows.Scan(&status, &n); err != nil {
			rows.Close()
			return s, err
		}
		s.AlertsByStatus[status] = n
	}
	rows.Close()

	rows, err = pool.Query(ctx, `SELECT severity, COUNT(*) FROM alerts WHERE status NOT IN ('RESOLVED') GROUP BY severity`)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var sev string
		var n int
		if err := rows.Scan(&sev, &n); err != nil {
			rows.Close()
			return s, err
		}
		s.AlertsBySeverity[sev] = n
	}
	rows.Close()

	rows, err = pool.Query(ctx, `SELECT severity, COUNT(*) FROM events WHERE received_at >= $1 GROUP BY severity`, since)
	if err != nil {
		return s, err
	}
	for rows.Next() {
		var sev string
		var n int
		if err := rows.Scan(&sev, &n); err != nil {
			rows.Close()
			return s, err
		}
		s.EventsBySeverity[sev] = n
	}
	return s, rows.Err()
}
