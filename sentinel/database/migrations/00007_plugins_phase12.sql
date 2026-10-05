-- +goose Up
-- Phase 12: plugin metadata for load policy + RBAC.

ALTER TABLE plugins
    ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS api_version INT NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS signature TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS source_path TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS load_status TEXT NOT NULL DEFAULT 'unknown',
    ADD COLUMN IF NOT EXISTS load_error TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN plugins.kind IS 'event_parser | notification_provider | detection_rule_provider | data_source';
COMMENT ON COLUMN plugins.checksum_sha256 IS 'Expected SHA-256 hex from plugin.json (admitted at last sync).';
COMMENT ON COLUMN plugins.load_status IS 'unknown | admitted | rejected | loaded | disabled';
COMMENT ON COLUMN plugins.load_error IS 'Last loader rejection/init error (no secrets).';

ALTER TABLE plugins
    DROP CONSTRAINT IF EXISTS plugins_load_status_check;
ALTER TABLE plugins
    ADD CONSTRAINT plugins_load_status_check CHECK (
        load_status IN ('unknown', 'admitted', 'rejected', 'loaded', 'disabled')
    );

INSERT INTO permissions (resource, action, description) VALUES
    ('plugins', 'read', 'View plugins and plugin configs'),
    ('plugins', 'write', 'Enable/disable plugins and manage plugin configs')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'plugins'
WHERE r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('plugins', 'read'),
    ('plugins', 'write')
)
WHERE r.name = 'OPERATOR'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'plugins' AND p.action = 'read'
WHERE r.name IN ('SECURITY_ANALYST', 'VIEWER')
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE resource = 'plugins'
);

DELETE FROM permissions WHERE resource = 'plugins';

ALTER TABLE plugins DROP CONSTRAINT IF EXISTS plugins_load_status_check;

ALTER TABLE plugins
    DROP COLUMN IF EXISTS kind,
    DROP COLUMN IF EXISTS api_version,
    DROP COLUMN IF EXISTS checksum_sha256,
    DROP COLUMN IF EXISTS signature,
    DROP COLUMN IF EXISTS source_path,
    DROP COLUMN IF EXISTS load_status,
    DROP COLUMN IF EXISTS load_error;
