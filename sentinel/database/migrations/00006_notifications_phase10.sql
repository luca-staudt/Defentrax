-- +goose Up
-- Phase 10: notification rules, encrypted channel secrets, delivery retries.

ALTER TABLE notification_channels
    ADD COLUMN IF NOT EXISTS secrets_encrypted TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS has_secrets BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN notification_channels.config IS 'Non-secret channel settings (JSON). Never store webhook URLs or passwords here.';
COMMENT ON COLUMN notification_channels.secrets_encrypted IS 'AES-GCM ciphertext of secret JSON (webhook URLs, SMTP passwords, auth headers). Never return in API.';

CREATE TABLE IF NOT EXISTS notification_rules (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name          TEXT NOT NULL,
    enabled       BOOLEAN NOT NULL DEFAULT TRUE,
    min_severity  TEXT NOT NULL,
    triggers      TEXT[] NOT NULL DEFAULT ARRAY['alert.created']::TEXT[],
    channel_ids   UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT notification_rules_name_unique UNIQUE (name),
    CONSTRAINT notification_rules_min_severity_check CHECK (
        min_severity IN ('info', 'low', 'medium', 'high', 'critical')
    ),
    CONSTRAINT notification_rules_triggers_nonempty CHECK (cardinality(triggers) >= 1)
);

CREATE INDEX IF NOT EXISTS idx_notification_rules_enabled
    ON notification_rules (enabled)
    WHERE enabled = TRUE;

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS attempt_count INT NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS last_attempt_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS trigger_event TEXT NOT NULL DEFAULT 'alert.created';

CREATE INDEX IF NOT EXISTS idx_notifications_retry
    ON notifications (next_attempt_at)
    WHERE status = 'pending' AND next_attempt_at IS NOT NULL;

-- RBAC: notifications resource
INSERT INTO permissions (resource, action, description) VALUES
    ('notifications', 'read', 'View notification channels and rules'),
    ('notifications', 'write', 'Manage notification channels and rules')
ON CONFLICT (resource, action) DO NOTHING;

-- ADMIN already gets all permissions via existing seed pattern; ensure explicit grants.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'notifications'
WHERE r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('notifications', 'read'),
    ('notifications', 'write')
)
WHERE r.name = 'OPERATOR'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'notifications' AND p.action = 'read'
WHERE r.name IN ('SECURITY_ANALYST', 'VIEWER')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE resource = 'notifications'
);

DELETE FROM permissions WHERE resource = 'notifications';

DROP INDEX IF EXISTS idx_notifications_retry;

ALTER TABLE notifications
    DROP COLUMN IF EXISTS attempt_count,
    DROP COLUMN IF EXISTS next_attempt_at,
    DROP COLUMN IF EXISTS last_attempt_at,
    DROP COLUMN IF EXISTS trigger_event;

DROP TABLE IF EXISTS notification_rules;

ALTER TABLE notification_channels
    DROP COLUMN IF EXISTS secrets_encrypted,
    DROP COLUMN IF EXISTS has_secrets;
