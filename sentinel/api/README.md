# Sentinel API (control plane)

Go HTTP service for Sentinel’s control plane: REST under `/api/v1`, future WebSockets, authentication, ingestion, and audit (phased delivery).

**Phase 4 scope:** Argon2id passwords, server-side sessions, RBAC middleware, TOTP 2FA, API keys, audit logging, login rate limits.

**Phase 5 scope:** Agent enrollment tokens, agent bearer auth, heartbeat, server/enrollment admin APIs.

**Phase 6 scope:** Batch event ingestion (`POST /api/v1/agent/events`), validation/normalization, idempotency, per-agent rate limits, batch DB insert.

**Phase 7 scope:** Detection engine integration — load YAML rules from `sentinel/rules`, async evaluation after ingest, Rules API (`list`/`get`/`enable`), minimal OPEN alert stubs.

## Run locally

From the repository root (requires `DATABASE_URL`, `SESSION_SECRET`, and migrations applied):

```bash
make db-migrate-up
make bootstrap-admin   # or set SENTINEL_BOOTSTRAP_* env on first API start
make run-api
```

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
