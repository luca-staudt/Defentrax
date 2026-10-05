-- +goose Up
-- Phase 8: alert deduplication fields and investigation timeline.

ALTER TABLE alerts
    ADD COLUMN dedup_key TEXT NOT NULL DEFAULT '',
    ADD COLUMN source_ip TEXT NOT NULL DEFAULT '',
    ADD COLUMN event_count INT NOT NULL DEFAULT 1,
    ADD COLUMN first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN resolution_notes TEXT NOT NULL DEFAULT '';

CREATE INDEX idx_alerts_dedup_active ON alerts (dedup_key)
    WHERE status <> 'RESOLVED' AND dedup_key <> '';

CREATE TABLE alert_timeline_events (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id        UUID NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    actor_user_id   UUID REFERENCES users (id) ON DELETE SET NULL,
    event_type      TEXT NOT NULL,
    message         TEXT NOT NULL DEFAULT '',
    metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alert_timeline_event_type_check CHECK (
        event_type IN (
            'created',
            'aggregated',
            'acknowledged',
            'investigating',
            'resolved',
            'assigned',
            'status_changed'
        )
    )
);

CREATE INDEX idx_alert_timeline_alert_id ON alert_timeline_events (alert_id, created_at DESC);

-- +goose Down
DROP TABLE IF EXISTS alert_timeline_events;

DROP INDEX IF EXISTS idx_alerts_dedup_active;

ALTER TABLE alerts
    DROP COLUMN IF EXISTS resolution_notes,
    DROP COLUMN IF EXISTS last_seen_at,
    DROP COLUMN IF EXISTS first_seen_at,
    DROP COLUMN IF EXISTS event_count,
    DROP COLUMN IF EXISTS source_ip,
    DROP COLUMN IF EXISTS dedup_key;
