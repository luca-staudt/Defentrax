# Sentinel API

REST control plane under `/api/v1`, plus liveness/readiness probes. Interactive docs and the machine-readable contract ship with the API binary.

## OpenAPI

| Artifact | Location |
|----------|----------|
| Spec (source) | [`sentinel/api/openapi/openapi.yaml`](../api/openapi/openapi.yaml) |
| Served YAML | `GET /api/v1/openapi.yaml` |
| Swagger UI | `GET /api/v1/docs` |

```bash
make run-api
# then open http://localhost:8080/api/v1/docs
curl -sS http://localhost:8080/api/v1/openapi.yaml | head
```

Validate the committed spec (uses `@redocly/cli` via `npx` when available):

```bash
make openapi-validate
```

A Go coverage test (`sentinel/api/openapi/coverage_test.go`) fails if the YAML drifts from the route inventory in `server.go`.

## Auth

| Scheme | How |
|--------|-----|
| Session cookie | `POST /api/v1/auth/login` (and TOTP/recovery verify) sets `sentinel_session` (name configurable) |
| API key | `Authorization: Bearer sent_…` (create under `/api/v1/users/me/api-keys`) |
| Agent token | `Authorization: Bearer sagt_…` after `POST /api/v1/agent/enroll` |

RBAC is enforced server-side with resource/action pairs (e.g. `alerts:read`). Roles: `SUPER_ADMIN`, `ADMIN`, `SECURITY_ANALYST`, `OPERATOR`, `VIEWER`. `SUPER_ADMIN` and `ADMIN` bypass granular checks.

Panel routes also require a `pages:*` permission. Both keys are required: the page key opens the screen, the existing read/write key allows the data. Migration `00009` copies page keys onto every role that already had the matching read permission, including custom roles. Change them under **Roles**.

| Page | Route | Page permission | Also required |
|------|--------|-----------------|---------------|
| Dashboard | `/dashboard` | `pages:dashboard` | `alerts:read` |
| Alerts | `/alerts` | `pages:alerts` | `alerts:read` |
| Alert detail | `/alerts/{id}` | `pages:alert_detail` | `alerts:read` (changes: `alerts:write`) |
| Events | `/events` | `pages:events` | `events:read` |
| Servers | `/servers` | `pages:servers` | `servers:read` (create: `servers:write`) |
| Server detail | `/servers/{id}` | `pages:server_detail` | `servers:read` (tokens: `servers:write`) |
| Rules | `/rules` | `pages:rules` | `rules:read` (enable and create: `rules:write`) |
| Notifications | `/notifications` | `pages:notifications` | `notifications:read` (edit: `notifications:write`) |
| Team | `/users` | `pages:team` | `users:read` (manage: `users:write`) |
| Roles | `/roles` | `pages:roles` | `roles:read` (edit: `roles:write`) |
| Audit logs | `/audit` | `pages:audit` | `audit_logs:read` |

There is no panel page for plugins or API keys. Those stay on `plugins:*` and `api_keys:write`.

Errors use a stable envelope:

```json
{ "code": "unauthorized", "message": "…", "request_id": "…" }
```

## Route groups (implemented)

| Area | Paths | Notes |
|------|-------|-------|
| Health | `/healthz`, `/readyz` | Outside `/api/v1` |
| Meta | `/api/v1`, `/api/v1/openapi.yaml`, `/api/v1/docs` | Public |
| Auth | `/api/v1/auth/*` | Login, session, TOTP |
| Users | `/api/v1/users`, `…/roles`, `…/me/api-keys` | Admin + personal keys |
| Servers | `/api/v1/servers`, enrollment tokens | Agents nested on server detail |
| Agents | `/api/v1/agent/enroll\|heartbeat\|events` | Protocol endpoints (not a list API) |
| Events | `/api/v1/events` | Operator list/get |
| Alerts | `/api/v1/alerts`, `/api/v1/ws/alerts` | Lifecycle + WebSocket |
| Rules | `/api/v1/rules` | List/get/enable |
| Notifications | `/api/v1/notification-channels`, `…/test`, `…/notification-rules` | Secrets never returned; channel test send |
| Dashboard | `/api/v1/dashboard/stats` | Aggregate metrics |
| Plugins | `/api/v1/plugins`, configs | See [plugins.md](plugins.md) |
| Audit | `/api/v1/audit-logs` | List/get; requires `audit_logs:read` |

## Honest gaps (not documented as endpoints)

- **Agents list** — use `GET /api/v1/servers/{id}` (`agents` array), not `/api/v1/agents`.
- **Metrics** — use `GET /api/v1/dashboard/stats`, not `/api/v1/metrics`.

## Related docs

- [agent.md](agent.md) — enrollment and host agent
- [plugins.md](plugins.md) — plugin SDK and load policy
- [API README](../api/README.md) — run/bootstrap/test notes
