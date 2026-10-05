# Sentinel API (control plane)

Go HTTP service for Sentinel’s control plane: REST under `/api/v1`, future WebSockets, authentication, ingestion, and audit (phased delivery).

**Phase 4 scope:** Argon2id passwords, server-side sessions, RBAC middleware, TOTP 2FA, API keys, audit logging, login rate limits.

**Phase 5 scope:** Agent enrollment tokens, agent bearer auth, heartbeat, server/enrollment admin APIs.

**Phase 6 scope:** Batch event ingestion (`POST /api/v1/agent/events`), validation/normalization, idempotency, per-agent rate limits, batch DB insert.

**Phase 7 scope:** Detection engine integration — load YAML rules from `sentinel/rules`, async evaluation after ingest, Rules API (`list`/`get`/`enable`), minimal OPEN alert stubs.

**Phase 8 scope:** Alert creation from detection matches with Redis/in-memory dedup and DB aggregation; lifecycle API (`OPEN` → `ACKNOWLEDGED` → `INVESTIGATING` → `RESOLVED`); assignment and resolution notes; timeline events; audit on lifecycle changes; `GET/PATCH /api/v1/alerts/*` with filters; recent-events stub for live dashboards.

**Phase 9 scope (frontend support):** Dashboard stats aggregation, events list/get, server detail with agents, WebSocket alert feed (`GET /api/v1/ws/alerts`), optional CORS (`CORS_ALLOWED_ORIGINS`), `/auth/me` includes permission keys for UI RBAC.

**Phase 10 scope:** Notification channels (Discord/Slack/email/generic webhook) with AES-GCM secrets at rest; severity-threshold rules; retry/backoff; audit on delivery failures; wired to alert create/update/status-change; admin APIs under `/api/v1/notification-channels` and `/api/v1/notification-rules` (`notifications:read`/`notifications:write`).

**Phase 12 scope:** Plugin system — stable SDK interfaces, allowlist/checksum/(optional) signature load policy, `plugin_configs`, enable/disable APIs (`plugins:read`/`plugins:write`), example `echo-parser`. See [`../docs/plugins.md`](../docs/plugins.md).

**Phase 13 scope:** OpenAPI 3 for implemented `/api/v1` routes — [`openapi/openapi.yaml`](openapi/openapi.yaml), served at `GET /api/v1/openapi.yaml` with Swagger UI at `GET /api/v1/docs`. Operator overview: [`../docs/api.md`](../docs/api.md).

## Run locally

From the repository root (requires `DATABASE_URL`, `SESSION_SECRET`, and migrations applied):

```bash
make db-migrate-up
make bootstrap-admin   # or set SENTINEL_BOOTSTRAP_* env on first API start
make run-api
```

Set `SECRETS_ENCRYPTION_KEY` (or `TOTP_ENCRYPTION_KEY`) to a 32-byte base64 key before creating notification channels.
## Bootstrap first admin

When the `users` table is empty:

```bash
export DATABASE_URL=...
export SENTINEL_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
export SENTINEL_BOOTSTRAP_ADMIN_PASSWORD='choose-a-long-password'
make bootstrap-admin
```

Alternatively, set the same `SENTINEL_BOOTSTRAP_*` variables before starting the API once; they are ignored after any user exists.

## Endpoints (Phase 4)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/healthz` | no | Liveness |
| GET | `/readyz` | no | Readiness |
| GET | `/api/v1/openapi.yaml` | no | OpenAPI 3 YAML |
| GET | `/api/v1/docs` | no | Swagger UI |
| POST | `/api/v1/auth/login` | no | Password login (TOTP challenge when enabled) |
| POST | `/api/v1/auth/totp/verify` | no | Complete login with TOTP |
| POST | `/api/v1/auth/recovery/verify` | no | Complete login with recovery code |
| POST | `/api/v1/auth/logout` | session | End session |
| GET | `/api/v1/auth/me` | session | Current user |
| POST | `/api/v1/auth/totp/enroll` | session | Start 2FA enrollment |
| POST | `/api/v1/auth/totp/confirm` | session | Confirm 2FA with TOTP code |
| POST | `/api/v1/auth/totp/disable` | session | Disable 2FA |
| GET/POST | `/api/v1/users` | RBAC | List/create users |
| PUT | `/api/v1/users/{id}/roles` | RBAC | Change roles (audited) |
| GET/POST | `/api/v1/users/me/api-keys` | RBAC | List/create API keys |
| DELETE | `/api/v1/users/me/api-keys/{id}` | RBAC | Revoke API key |
| GET/POST | `/api/v1/servers` | `servers:write` | List/create servers |
| POST | `/api/v1/servers/{id}/enrollment-tokens` | `servers:write` | Create one-time `senr_…` enrollment token |
| POST | `/api/v1/agent/enroll` | enrollment token (body) | Register agent; returns one-time `sagt_…` |
| POST | `/api/v1/agent/heartbeat` | agent bearer | Update `last_heartbeat_at` / status |
| POST | `/api/v1/agent/events` | agent bearer | Ingest validated events (batch ≤100) |
| GET | `/api/v1/rules` | `rules:read` | List detection rules |
| GET | `/api/v1/rules/{id}` | `rules:read` | Get one rule |
| PATCH | `/api/v1/rules/{id}` | `rules:write` | Enable/disable a rule (`{"enabled":true\|false}`) |

## Tests

```bash
make api-test
make api-test-integration   # requires PostgreSQL (TEST_DATABASE_URL)
```

## Secure defaults

- No default admin credentials in the repository.
- Session and API tokens are stored hashed; responses never include password hashes or raw tokens (except one-time API key on create).
- Login rate limiting uses Redis when `REDIS_URL` is set; otherwise an in-memory limiter per process.
