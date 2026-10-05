-- +goose Up
INSERT INTO permissions (resource, action, description) VALUES
    ('rules', 'read', 'View detection rules')
ON CONFLICT (resource, action) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'rules' AND p.action = 'read'
WHERE r.name IN ('ADMIN', 'SECURITY_ANALYST', 'OPERATOR', 'VIEWER')
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM roles r
JOIN permissions p ON p.resource = 'rules' AND p.action = 'write'
WHERE r.name = 'SECURITY_ANALYST'
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'rules' AND action = 'read');

DELETE FROM permissions WHERE resource = 'rules' AND action = 'read';
