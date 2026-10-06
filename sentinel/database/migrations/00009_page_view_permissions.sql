-- +goose Up
-- Page visibility is separate from data actions.
-- Key format stays resource:action, resource = pages, action = panel route.
-- Existing roles keep the pages they can already open: each page is copied from
-- the read permission that previously showed that screen (including custom roles).

INSERT INTO permissions (resource, action, description) VALUES
    ('pages', 'dashboard', 'Open the Dashboard page'),
    ('pages', 'alerts', 'Open the Alerts page'),
    ('pages', 'alert_detail', 'Open a single alert page'),
    ('pages', 'events', 'Open the Events page'),
    ('pages', 'servers', 'Open the Servers page'),
    ('pages', 'server_detail', 'Open a single server page'),
    ('pages', 'rules', 'Open the Rules page'),
    ('pages', 'notifications', 'Open the Notifications page'),
    ('pages', 'team', 'Open the Team page'),
    ('pages', 'roles', 'Open the Roles page'),
    ('pages', 'audit', 'Open the Audit logs page')
ON CONFLICT (resource, action) DO NOTHING;

-- alerts:read currently shows Dashboard, Alerts, and alert detail.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages'
    AND page.action IN ('dashboard', 'alerts', 'alert_detail')
WHERE src.resource = 'alerts' AND src.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND page.action = 'events'
WHERE src.resource = 'events' AND src.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages'
    AND page.action IN ('servers', 'server_detail')
WHERE src.resource = 'servers' AND src.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND page.action = 'rules'
WHERE src.resource = 'rules' AND src.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND page.action = 'notifications'
WHERE src.resource = 'notifications' AND src.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND page.action = 'team'
WHERE src.resource = 'users' AND src.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND page.action = 'roles'
WHERE src.resource = 'roles' AND src.action = 'read'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND page.action = 'audit'
WHERE src.resource = 'audit_logs' AND src.action = 'read'
ON CONFLICT DO NOTHING;

-- Write-only roles still need the page that hosts the mutation.
INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND page.action = 'alert_detail'
WHERE src.resource = 'alerts' AND src.action = 'write'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages'
    AND page.action IN ('servers', 'server_detail')
WHERE src.resource = 'servers' AND src.action = 'write'
ON CONFLICT DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT DISTINCT rp.role_id, page.id
FROM role_permissions rp
JOIN permissions src ON src.id = rp.permission_id
JOIN permissions page ON page.resource = 'pages' AND (
    (src.resource = 'rules' AND src.action = 'write' AND page.action = 'rules')
    OR (src.resource = 'notifications' AND src.action = 'write' AND page.action = 'notifications')
    OR (src.resource = 'users' AND src.action = 'write' AND page.action = 'team')
    OR (src.resource = 'roles' AND src.action = 'write' AND page.action = 'roles')
)
ON CONFLICT DO NOTHING;

-- +goose Down
DELETE FROM role_permissions
WHERE permission_id IN (SELECT id FROM permissions WHERE resource = 'pages');

DELETE FROM permissions WHERE resource = 'pages';
