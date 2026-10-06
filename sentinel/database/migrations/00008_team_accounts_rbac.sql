-- +goose Up
-- Team accounts: system/custom roles, SUPER_ADMIN, expanded permissions (keep resource:action keys).

ALTER TABLE roles
    ADD COLUMN IF NOT EXISTS is_system BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE roles SET is_system = TRUE
WHERE name IN ('ADMIN', 'SECURITY_ANALYST', 'OPERATOR', 'VIEWER');

UPDATE roles SET description = 'Admin — full platform administration (legacy super-user)'
WHERE name = 'ADMIN';

INSERT INTO roles (name, description, is_system) VALUES
    ('SUPER_ADMIN', 'Super Admin — unrestricted platform control', TRUE)
ON CONFLICT (name) DO UPDATE SET
    description = EXCLUDED.description,
    is_system = TRUE;

-- New granular permissions (additive; existing resource:action keys unchanged).
INSERT INTO permissions (resource, action, description) VALUES
    ('servers', 'read', 'View servers and agents'),
    ('roles', 'read', 'View roles and permission assignments'),
    ('roles', 'write', 'Create/edit/delete custom roles and assign permissions'),
    ('audit_logs', 'export', 'Export audit trail'),
    ('settings', 'read', 'View platform settings'),
    ('settings', 'write', 'Edit platform settings')
ON CONFLICT (resource, action) DO NOTHING;

-- SUPER_ADMIN gets every permission.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'SUPER_ADMIN'
ON CONFLICT DO NOTHING;

-- ADMIN already has all historical perms via 00002; grant new ones too.
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('servers', 'read'),
    ('roles', 'read'),
    ('roles', 'write'),
    ('audit_logs', 'export'),
    ('settings', 'read'),
    ('settings', 'write')
)
WHERE r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

-- SECURITY_ANALYST: view servers + roles (read) + audit export
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('servers', 'read'),
    ('roles', 'read'),
    ('audit_logs', 'export')
)
WHERE r.name = 'SECURITY_ANALYST'
ON CONFLICT DO NOTHING;

-- OPERATOR: servers:read (write already granted)
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'servers' AND p.action = 'read'
WHERE r.name = 'OPERATOR'
ON CONFLICT DO NOTHING;

-- VIEWER: servers:read + roles:read
INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('servers', 'read'),
    ('roles', 'read')
)
WHERE r.name = 'VIEWER'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
WHERE permission_id IN (
    SELECT id FROM permissions WHERE (resource, action) IN (
        ('servers', 'read'),
        ('roles', 'read'),
        ('roles', 'write'),
        ('audit_logs', 'export'),
        ('settings', 'read'),
        ('settings', 'write')
    )
);

DELETE FROM permissions WHERE (resource, action) IN (
    ('servers', 'read'),
    ('roles', 'read'),
    ('roles', 'write'),
    ('audit_logs', 'export'),
    ('settings', 'read'),
    ('settings', 'write')
);

DELETE FROM user_roles WHERE role_id IN (SELECT id FROM roles WHERE name = 'SUPER_ADMIN');
DELETE FROM role_permissions WHERE role_id IN (SELECT id FROM roles WHERE name = 'SUPER_ADMIN');
DELETE FROM roles WHERE name = 'SUPER_ADMIN';

ALTER TABLE roles DROP COLUMN IF EXISTS updated_at;
ALTER TABLE roles DROP COLUMN IF EXISTS is_system;
