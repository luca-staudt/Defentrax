package store

import (
	"context"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// EventInsertRow is one normalized event ready for batch insert.
type EventInsertRow struct {
	IngestID    string
	OccurredAt  time.Time
	Source      string
	Category    string
	Severity    string
	Host        string
	Message     string
	Fingerprint string
	Raw         []byte
	Fields      []byte
}

// InsertedEvent is a newly persisted event row.
type InsertedEvent struct {
	ID       uuid.UUID
	IngestID string
}

// InsertEventsBatch inserts many events for one agent in a single statement. Returns newly inserted events.
func InsertEventsBatch(ctx context.Context, pool *pgxpool.Pool, agentID, serverID uuid.UUID, rows []EventInsertRow) ([]InsertedEvent, error) {
	if len(rows) == 0 {
		return nil, nil
	}
	n := len(rows)
	ingestIDs := make([]string, n)
	occurredAt := make([]time.Time, n)
	sources := make([]string, n)
	categories := make([]string, n)
	severities := make([]string, n)
	hosts := make([]string, n)
	messages := make([]string, n)
	fingerprints := make([]string, n)
	raws := make([]string, n)
	fields := make([]string, n)
	for i, r := range rows {
		ingestIDs[i] = r.IngestID
		occurredAt[i] = r.OccurredAt
		sources[i] = r.Source
		categories[i] = r.Category
		severities[i] = r.Severity
		hosts[i] = r.Host
		messages[i] = r.Message
		fingerprints[i] = r.Fingerprint
		raws[i] = string(r.Raw)
		fields[i] = string(r.Fields)
	}

	q := `
INSERT INTO events (agent_id, server_id, ingest_id, occurred_at, source, category, severity, host, message, raw, fields, fingerprint)
SELECT $1, $2, i.ingest_id, i.occurred_at, i.source, i.category, i.severity, i.host, i.message, i.raw::jsonb, i.fields::jsonb, i.fingerprint
FROM unnest(
	$3::text[],
	$4::timestamptz[],
	$5::text[],
	$6::text[],
	$7::text[],
	$8::text[],
	$9::text[],
	$10::text[],
	$11::text[],
	$12::text[]
) AS i(ingest_id, occurred_at, source, category, severity, host, message, raw, fields, fingerprint)
ON CONFLICT (agent_id, ingest_id) DO NOTHING
RETURNING id, ingest_id
`
	dbRows, err := pool.Query(ctx, q, agentID, serverID, ingestIDs, occurredAt, sources, categories, severities, hosts, messages, raws, fields, fingerprints)
	if err != nil {
		return nil, err
	}
	defer dbRows.Close()
	var inserted []InsertedEvent
	for dbRows.Next() {
		var ev InsertedEvent
		if err := dbRows.Scan(&ev.ID, &ev.IngestID); err != nil {
			return nil, err
		}
		inserted = append(inserted, ev)
	}
	return inserted, dbRows.Err()
}
