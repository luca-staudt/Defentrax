-- +goose Up
-- Defentrax core schema (Phase 3). All timestamps UTC; UUID primary keys.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------------------------------------------------------------------------
-- Identity & RBAC
-- ---------------------------------------------------------------------------

CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email           TEXT NOT NULL UNIQUE,
    password_hash   TEXT NOT NULL,
    display_name    TEXT NOT NULL DEFAULT '',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    email_verified_at TIMESTAMPTZ,
    last_login_at   TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT users_password_hash_nonempty CHECK (char_length(password_hash) >= 32)
);

COMMENT ON COLUMN users.password_hash IS 'Argon2id or bcrypt hash only; never plaintext.';

CREATE TABLE roles (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT roles_name_unique UNIQUE (name),
    CONSTRAINT roles_name_not_empty CHECK (char_length(trim(name)) > 0)
);

CREATE TABLE permissions (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    resource    TEXT NOT NULL,
    action      TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT permissions_resource_action_unique UNIQUE (resource, action)
);

CREATE TABLE user_roles (
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    role_id     UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    assigned_by UUID REFERENCES users (id) ON DELETE SET NULL,
    PRIMARY KEY (user_id, role_id)
);

CREATE INDEX idx_user_roles_role_id ON user_roles (role_id);

-- ---------------------------------------------------------------------------
-- Infrastructure targets
-- ---------------------------------------------------------------------------

CREATE TABLE servers (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    hostname    TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    environment TEXT NOT NULL DEFAULT '',
    labels      JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT servers_name_unique UNIQUE (name)
);

CREATE TABLE agents (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id         UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    name              TEXT NOT NULL DEFAULT '',
    status            TEXT NOT NULL DEFAULT 'pending',
    agent_version     TEXT NOT NULL DEFAULT '',
    last_heartbeat_at TIMESTAMPTZ,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agents_status_check CHECK (
        status IN ('pending', 'active', 'offline', 'revoked')
    )
);

CREATE INDEX idx_agents_server_id ON agents (server_id);
CREATE INDEX idx_agents_status ON agents (status);

CREATE TABLE agent_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID NOT NULL REFERENCES agents (id) ON DELETE CASCADE,
    token_hash  TEXT NOT NULL,
    token_prefix TEXT NOT NULL DEFAULT '',
    label       TEXT NOT NULL DEFAULT '',
    expires_at  TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT agent_tokens_hash_nonempty CHECK (char_length(token_hash) >= 32)
);

COMMENT ON COLUMN agent_tokens.token_hash IS 'SHA-256 or Argon2id of agent bearer token; never store plaintext.';

CREATE INDEX idx_agent_tokens_agent_id ON agent_tokens (agent_id);
CREATE INDEX idx_agent_tokens_active ON agent_tokens (agent_id) WHERE revoked_at IS NULL;

-- ---------------------------------------------------------------------------
-- Detection rules
-- ---------------------------------------------------------------------------

CREATE TABLE rules (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    enabled     BOOLEAN NOT NULL DEFAULT TRUE,
    severity    TEXT NOT NULL DEFAULT 'medium',
    definition  JSONB NOT NULL DEFAULT '{}'::JSONB,
    version     INT NOT NULL DEFAULT 1,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT rules_name_unique UNIQUE (name),
    CONSTRAINT rules_severity_check CHECK (
        severity IN ('info', 'low', 'medium', 'high', 'critical')
    )
);

-- ---------------------------------------------------------------------------
-- Events (ingestion)
-- ---------------------------------------------------------------------------

CREATE TABLE events (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id    UUID NOT NULL REFERENCES agents (id) ON DELETE RESTRICT,
    server_id   UUID NOT NULL REFERENCES servers (id) ON DELETE RESTRICT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    occurred_at TIMESTAMPTZ NOT NULL,
    source      TEXT NOT NULL,
    category    TEXT NOT NULL DEFAULT '',
    severity    TEXT NOT NULL DEFAULT 'info',
    host        TEXT NOT NULL DEFAULT '',
    message     TEXT NOT NULL,
    raw         JSONB NOT NULL DEFAULT '{}'::JSONB,
    fields      JSONB NOT NULL DEFAULT '{}'::JSONB,
    fingerprint TEXT NOT NULL DEFAULT '',
    ingest_id   TEXT NOT NULL,
    CONSTRAINT events_agent_ingest_unique UNIQUE (agent_id, ingest_id),
    CONSTRAINT events_severity_check CHECK (
        severity IN ('info', 'low', 'medium', 'high', 'critical')
    )
);

CREATE INDEX idx_events_received_at ON events (received_at DESC);
CREATE INDEX idx_events_server_received ON events (server_id, received_at DESC);
CREATE INDEX idx_events_agent_received ON events (agent_id, received_at DESC);
CREATE INDEX idx_events_severity_received ON events (severity, received_at DESC);
CREATE INDEX idx_events_source ON events (source);
CREATE INDEX idx_events_fields_gin ON events USING GIN (fields);

-- ---------------------------------------------------------------------------
-- Alerts
-- ---------------------------------------------------------------------------

CREATE TABLE alerts (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id        UUID REFERENCES servers (id) ON DELETE SET NULL,
    rule_id          UUID REFERENCES rules (id) ON DELETE SET NULL,
    assigned_to      UUID REFERENCES users (id) ON DELETE SET NULL,
    title            TEXT NOT NULL,
    description      TEXT NOT NULL DEFAULT '',
    status           TEXT NOT NULL DEFAULT 'OPEN',
    severity         TEXT NOT NULL DEFAULT 'medium',
    opened_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    acknowledged_at  TIMESTAMPTZ,
    investigating_at TIMESTAMPTZ,
    resolved_at      TIMESTAMPTZ,
    metadata         JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT alerts_status_check CHECK (
        status IN ('OPEN', 'ACKNOWLEDGED', 'INVESTIGATING', 'RESOLVED')
    ),
    CONSTRAINT alerts_severity_check CHECK (
        severity IN ('info', 'low', 'medium', 'high', 'critical')
    )
);

CREATE INDEX idx_alerts_status_opened ON alerts (status, opened_at DESC);
CREATE INDEX idx_alerts_server_id ON alerts (server_id);
CREATE INDEX idx_alerts_assigned_to ON alerts (assigned_to) WHERE assigned_to IS NOT NULL;

CREATE TABLE alert_rules (
    alert_id UUID NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    rule_id  UUID NOT NULL REFERENCES rules (id) ON DELETE CASCADE,
    PRIMARY KEY (alert_id, rule_id)
);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE notification_channels (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name         TEXT NOT NULL,
    channel_type TEXT NOT NULL,
    config       JSONB NOT NULL DEFAULT '{}'::JSONB,
    enabled      BOOLEAN NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_channels_name_unique UNIQUE (name),
    CONSTRAINT notification_channels_type_check CHECK (
        channel_type IN ('discord', 'slack', 'email', 'webhook')
    )
);

CREATE TABLE notifications (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id   UUID NOT NULL REFERENCES alerts (id) ON DELETE CASCADE,
    channel_id UUID NOT NULL REFERENCES notification_channels (id) ON DELETE CASCADE,
    status     TEXT NOT NULL DEFAULT 'pending',
    payload    JSONB NOT NULL DEFAULT '{}'::JSONB,
    error      TEXT NOT NULL DEFAULT '',
    sent_at    TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notifications_status_check CHECK (
        status IN ('pending', 'sent', 'failed', 'skipped')
    )
);

CREATE INDEX idx_notifications_alert_id ON notifications (alert_id);
CREATE INDEX idx_notifications_status ON notifications (status) WHERE status = 'pending';

-- ---------------------------------------------------------------------------
-- Audit & auth artifacts (Phase 4 consumes these tables)
-- ---------------------------------------------------------------------------

CREATE TABLE audit_logs (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES users (id) ON DELETE SET NULL,
    actor_type    TEXT NOT NULL DEFAULT 'user',
    action        TEXT NOT NULL,
    entity_type   TEXT NOT NULL,
    entity_id     UUID,
    metadata      JSONB NOT NULL DEFAULT '{}'::JSONB,
    ip_address    INET,
    user_agent    TEXT NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT audit_logs_actor_type_check CHECK (
        actor_type IN ('user', 'system', 'agent', 'api_key')
    )
);

CREATE INDEX idx_audit_logs_created_at ON audit_logs (created_at DESC);
CREATE INDEX idx_audit_logs_actor_user ON audit_logs (actor_user_id) WHERE actor_user_id IS NOT NULL;
CREATE INDEX idx_audit_logs_entity ON audit_logs (entity_type, entity_id);

CREATE TABLE api_keys (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    name        TEXT NOT NULL,
    key_hash    TEXT NOT NULL,
    key_prefix  TEXT NOT NULL DEFAULT '',
    scopes      JSONB NOT NULL DEFAULT '[]'::JSONB,
    expires_at  TIMESTAMPTZ,
    revoked_at  TIMESTAMPTZ,
    last_used_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT api_keys_hash_nonempty CHECK (char_length(key_hash) >= 32)
);

COMMENT ON COLUMN api_keys.key_hash IS 'Hash of API key secret; never store plaintext.';

CREATE INDEX idx_api_keys_user_id ON api_keys (user_id);

CREATE TABLE sessions (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id            UUID NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    session_token_hash TEXT NOT NULL,
    expires_at         TIMESTAMPTZ NOT NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    ip_address         INET,
    user_agent         TEXT NOT NULL DEFAULT '',
    CONSTRAINT sessions_token_hash_nonempty CHECK (char_length(session_token_hash) >= 32)
);

CREATE INDEX idx_sessions_user_id ON sessions (user_id);
CREATE INDEX idx_sessions_expires_at ON sessions (expires_at);

CREATE TABLE two_factor_auth (
    user_id              UUID PRIMARY KEY REFERENCES users (id) ON DELETE CASCADE,
    totp_secret_encrypted TEXT NOT NULL DEFAULT '',
    enabled              BOOLEAN NOT NULL DEFAULT FALSE,
    backup_codes_hash    TEXT NOT NULL DEFAULT '',
    enrolled_at          TIMESTAMPTZ,
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

COMMENT ON COLUMN two_factor_auth.totp_secret_encrypted IS 'Encrypted TOTP secret (Phase 4); not plaintext.';

-- ---------------------------------------------------------------------------
-- Plugins & metrics
-- ---------------------------------------------------------------------------

CREATE TABLE plugins (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL,
    name        TEXT NOT NULL,
    version     TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL DEFAULT '',
    enabled     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT plugins_slug_unique UNIQUE (slug)
);

CREATE TABLE plugin_configs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    plugin_id   UUID NOT NULL REFERENCES plugins (id) ON DELETE CASCADE,
    config_key  TEXT NOT NULL,
    config_value JSONB NOT NULL DEFAULT '{}'::JSONB,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT plugin_configs_plugin_key_unique UNIQUE (plugin_id, config_key)
);

CREATE TABLE server_metrics (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id      UUID NOT NULL REFERENCES servers (id) ON DELETE CASCADE,
    agent_id       UUID REFERENCES agents (id) ON DELETE SET NULL,
    collected_at   TIMESTAMPTZ NOT NULL,
    cpu_percent    DOUBLE PRECISION,
    memory_percent DOUBLE PRECISION,
    disk_percent   DOUBLE PRECISION,
    metrics        JSONB NOT NULL DEFAULT '{}'::JSONB,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_server_metrics_server_collected ON server_metrics (server_id, collected_at DESC);

-- +goose Down
DROP TABLE IF EXISTS server_metrics;
DROP TABLE IF EXISTS plugin_configs;
DROP TABLE IF EXISTS plugins;
DROP TABLE IF EXISTS two_factor_auth;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS notifications;
DROP TABLE IF EXISTS notification_channels;
DROP TABLE IF EXISTS alert_rules;
DROP TABLE IF EXISTS alerts;
DROP TABLE IF EXISTS events;
DROP TABLE IF EXISTS rules;
DROP TABLE IF EXISTS agent_tokens;
DROP TABLE IF EXISTS agents;
DROP TABLE IF EXISTS servers;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;
DROP TABLE IF EXISTS users;

DROP EXTENSION IF EXISTS pgcrypto;
