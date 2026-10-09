-- +goose Up
-- Allow timeline rows when an alert is reopened from RESOLVED → OPEN.

ALTER TABLE alert_timeline_events
    DROP CONSTRAINT IF EXISTS alert_timeline_event_type_check;

ALTER TABLE alert_timeline_events
    ADD CONSTRAINT alert_timeline_event_type_check CHECK (
        event_type IN (
            'created',
            'aggregated',
            'acknowledged',
            'investigating',
            'resolved',
            'reopened',
            'assigned',
            'status_changed'
        )
    );

-- +goose Down
ALTER TABLE alert_timeline_events
    DROP CONSTRAINT IF EXISTS alert_timeline_event_type_check;

ALTER TABLE alert_timeline_events
    ADD CONSTRAINT alert_timeline_event_type_check CHECK (
        event_type IN (
            'created',
            'aggregated',
            'acknowledged',
            'investigating',
            'resolved',
            'assigned',
            'status_changed'
        )
    );
