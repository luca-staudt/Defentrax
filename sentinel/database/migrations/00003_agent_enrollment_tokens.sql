-- +goose Up
-- One-time (or time-limited) enrollment tokens for agent registration; only hashes stored.

CREATE TABLE agent_enrollment_tokens (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id          UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    token_hash         TEXT NOT NULL,
    token_prefix       TEXT NOT NULL DEFAULT '',
    label              TEXT NOT NULL DEFAULT '',
    expires_at         TIMESTAMPTZ NOT NULL,
    used_at            TIMESTAMPTZ,
    used_by_agent_id   UUID REFERENCES agents (id) ON DELETE SET NULL,
    created_by_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    revoked_at         TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agent_enrollment_tokens_hash_nonempty CHECK (char_length(token_hash) >= 32)
);

CREATE INDEX idx_agent_enrollment_tokens_server_id ON agent_enrollment_tokens (server_id);
CREATE INDEX idx_agent_enrollment_tokens_active ON agent_enrollment_tokens (server_id)
    WHERE revoked_at IS NULL AND used_at IS NULL;

COMMENT ON TABLE agent_enrollment_tokens IS 'Enrollment secrets for agent bootstrap; plaintext shown once at creation.';

-- +goose Down
DROP TABLE IF EXISTS agent_enrollment_tokens;
