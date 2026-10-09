-- +goose Up
-- Intervention policy (observe / suggest / act) and optional AI analysis settings.
-- Defaults stay safe: intervention disabled, mode observe, no destructive capabilities.

CREATE TABLE IF NOT EXISTS intervention_settings (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    scope               TEXT NOT NULL DEFAULT 'global',
    server_id           UUID REFERENCES servers(id) ON DELETE CASCADE,
    enabled             BOOLEAN NOT NULL DEFAULT FALSE,
    mode                TEXT NOT NULL DEFAULT 'observe',
    allow_block_ip      BOOLEAN NOT NULL DEFAULT FALSE,
    allow_kill_process  BOOLEAN NOT NULL DEFAULT FALSE,
    allow_firewall_rule BOOLEAN NOT NULL DEFAULT FALSE,
    protected_cidrs     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    updated_by          UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT intervention_settings_scope_check CHECK (scope IN ('global', 'server')),
    CONSTRAINT intervention_settings_mode_check CHECK (mode IN ('observe', 'suggest', 'act')),
    CONSTRAINT intervention_settings_scope_server CHECK (
        (scope = 'global' AND server_id IS NULL)
        OR (scope = 'server' AND server_id IS NOT NULL)
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_intervention_settings_global
    ON intervention_settings ((true))
    WHERE scope = 'global';

CREATE UNIQUE INDEX IF NOT EXISTS uq_intervention_settings_server
    ON intervention_settings (server_id)
    WHERE scope = 'server' AND server_id IS NOT NULL;

INSERT INTO intervention_settings (scope, enabled, mode)
SELECT 'global', FALSE, 'observe'
WHERE NOT EXISTS (SELECT 1 FROM intervention_settings WHERE scope = 'global');

CREATE TABLE IF NOT EXISTS intervention_actions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    server_id       UUID NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
    agent_id        UUID REFERENCES agents(id) ON DELETE SET NULL,
    alert_id        UUID REFERENCES alerts(id) ON DELETE SET NULL,
    event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
    action_type     TEXT NOT NULL,
    payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
    status          TEXT NOT NULL DEFAULT 'pending',
    mode_at_request TEXT NOT NULL DEFAULT 'suggest',
    reason          TEXT NOT NULL DEFAULT '',
    requested_by    UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    decided_at      TIMESTAMPTZ,
    queued_at       TIMESTAMPTZ,
    completed_at    TIMESTAMPTZ,
    result          JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message   TEXT NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT intervention_actions_type_check CHECK (
        action_type IN ('block_ip', 'kill_process', 'firewall_rule')
    ),
    CONSTRAINT intervention_actions_status_check CHECK (
        status IN ('pending', 'approved', 'denied', 'queued', 'running', 'succeeded', 'failed', 'cancelled')
    ),
    CONSTRAINT intervention_actions_mode_check CHECK (
        mode_at_request IN ('observe', 'suggest', 'act')
    )
);

CREATE INDEX IF NOT EXISTS idx_intervention_actions_status_created
    ON intervention_actions (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_actions_server
    ON intervention_actions (server_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intervention_actions_agent_queue
    ON intervention_actions (agent_id, status, created_at)
    WHERE status IN ('queued', 'approved');

CREATE TABLE IF NOT EXISTS ai_analysis_settings (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    enabled            BOOLEAN NOT NULL DEFAULT FALSE,
    provider           TEXT NOT NULL DEFAULT 'openai',
    base_url           TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    model              TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    api_key_encrypted  TEXT NOT NULL DEFAULT '',
    has_api_key        BOOLEAN NOT NULL DEFAULT FALSE,
    updated_by         UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ai_analysis_settings_provider_check CHECK (provider IN ('openai', 'openai_compatible'))
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_ai_analysis_settings_singleton
    ON ai_analysis_settings ((true));

INSERT INTO ai_analysis_settings (enabled, provider, base_url, model)
SELECT FALSE, 'openai', 'https://api.openai.com/v1', 'gpt-4o-mini'
WHERE NOT EXISTS (SELECT 1 FROM ai_analysis_settings);

CREATE TABLE IF NOT EXISTS ai_analyses (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    alert_id        UUID REFERENCES alerts(id) ON DELETE SET NULL,
    event_id        UUID REFERENCES events(id) ON DELETE SET NULL,
    status          TEXT NOT NULL DEFAULT 'completed',
    model           TEXT NOT NULL DEFAULT '',
    assessment      JSONB NOT NULL DEFAULT '{}'::jsonb,
    error_message   TEXT NOT NULL DEFAULT '',
    created_by      UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT ai_analyses_status_check CHECK (status IN ('pending', 'completed', 'failed')),
    CONSTRAINT ai_analyses_target_check CHECK (alert_id IS NOT NULL OR event_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_ai_analyses_alert
    ON ai_analyses (alert_id, created_at DESC)
    WHERE alert_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ai_analyses_created
    ON ai_analyses (created_at DESC);

INSERT INTO permissions (resource, action, description) VALUES
    ('intervention', 'read', 'View intervention settings and action history'),
    ('intervention', 'write', 'Configure intervention policy and request actions'),
    ('intervention', 'approve', 'Approve or deny suggested intervention actions'),
    ('ai', 'read', 'View AI analysis settings and past assessments'),
    ('ai', 'write', 'Configure AI providers and run analyses'),
    ('pages', 'interventions', 'Open the Interventions page'),
    ('pages', 'ai', 'Open the AI analysis settings page')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource IN ('intervention', 'ai')
    OR (p.resource = 'pages' AND p.action IN ('interventions', 'ai'))
WHERE r.name IN ('SUPER_ADMIN', 'ADMIN')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('intervention', 'read'),
    ('intervention', 'write'),
    ('intervention', 'approve'),
    ('pages', 'interventions'),
    ('ai', 'read'),
    ('pages', 'ai')
)
WHERE r.name = 'OPERATOR'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('intervention', 'read'),
    ('pages', 'interventions'),
    ('ai', 'read'),
    ('pages', 'ai')
)
WHERE r.name IN ('SECURITY_ANALYST', 'VIEWER')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions
    WHERE resource IN ('intervention', 'ai')
       OR (resource = 'pages' AND action IN ('interventions', 'ai'))
);

DELETE FROM permissions
WHERE resource IN ('intervention', 'ai')
   OR (resource = 'pages' AND action IN ('interventions', 'ai'));

DROP TABLE IF EXISTS ai_analyses;
DROP TABLE IF EXISTS ai_analysis_settings;
DROP TABLE IF EXISTS intervention_actions;
DROP TABLE IF EXISTS intervention_settings;
