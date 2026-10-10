-- +goose Up
-- Panel-controlled intervention dry-run (agents prefer heartbeat over env).

ALTER TABLE intervention_settings
    ADD COLUMN IF NOT EXISTS dry_run BOOLEAN NOT NULL DEFAULT TRUE;

UPDATE intervention_settings SET dry_run = TRUE WHERE dry_run IS NULL;

-- +goose Down
ALTER TABLE intervention_settings
    DROP COLUMN IF EXISTS dry_run;
