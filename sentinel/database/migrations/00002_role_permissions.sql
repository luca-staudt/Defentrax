-- +goose Up
-- Role ↔ permission mapping for server-side RBAC (reference data).

CREATE TABLE role_permissions (
    role_id       UUID NOT NULL REFERENCES roles (id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES permissions (id) ON DELETE CASCADE,
    PRIMARY KEY (role_id, permission_id)
);

CREATE INDEX idx_role_permissions_permission_id ON role_permissions (permission_id);

INSERT INTO roles (name, description) VALUES
    ('ADMIN', 'Full platform administration'),
    ('SECURITY_ANALYST', 'Investigate alerts and tune detection'),
    ('OPERATOR', 'Manage servers, agents, and notifications'),
    ('VIEWER', 'Read-only access')
ON CONFLICT (name) DO NOTHING;

INSERT INTO permissions (resource, action, description) VALUES
    ('users', 'read', 'View users'),
    ('users', 'write', 'Manage users'),
    ('alerts', 'read', 'View alerts'),
    ('alerts', 'write', 'Update alert lifecycle'),
    ('events', 'read', 'View events'),
    ('servers', 'write', 'Manage servers and agents'),
    ('rules', 'write', 'Manage detection rules'),
    ('audit_logs', 'read', 'View audit trail'),
    ('api_keys', 'write', 'Manage personal API keys')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r CROSS JOIN permissions p WHERE r.name = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('users', 'read'),
    ('alerts', 'read'),
    ('alerts', 'write'),
    ('events', 'read'),
    ('audit_logs', 'read')
)
WHERE r.name = 'SECURITY_ANALYST'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('servers', 'write'),
    ('events', 'read'),
    ('alerts', 'read')
)
WHERE r.name = 'OPERATOR'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON (p.resource, p.action) IN (
    ('users', 'read'),
    ('alerts', 'read'),
    ('events', 'read')
)
WHERE r.name = 'VIEWER'
ON CONFLICT DO NOTHING;

-- +goose Down
DROP TABLE IF EXISTS role_permissions;
