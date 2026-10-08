-- +goose Up
-- Maintenance windows and per-operator saved queue filters.

CREATE TABLE silences (
    target_kind TEXT NOT NULL,
    target_id   UUID NOT NULL,
    until_at    TIMESTAMPTZ NOT NULL,
    created_by  UUID REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (target_kind, target_id),
    CONSTRAINT silences_kind_check CHECK (target_kind IN ('rule', 'server'))
);

CREATE INDEX idx_silences_until ON silences (until_at);

CREATE TABLE saved_views (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_user_id UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    kind          TEXT NOT NULL,
    name          TEXT NOT NULL,
    query         JSONB NOT NULL DEFAULT '{}'::JSONB,
    is_default    BOOLEAN NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT saved_views_kind_check CHECK (kind IN ('alerts', 'events')),
    CONSTRAINT saved_views_name_len CHECK (char_length(name) BETWEEN 1 AND 80),
    CONSTRAINT saved_views_owner_kind_name UNIQUE (owner_user_id, kind, name)
);

CREATE UNIQUE INDEX idx_saved_views_one_default
    ON saved_views (owner_user_id, kind)
    WHERE is_default;

-- +goose Down
DROP TABLE IF EXISTS saved_views;
DROP TABLE IF EXISTS silences;
