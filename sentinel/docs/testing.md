# Testing guide

Sentinel tests are split into a **fast unit suite** (default in CI) and **PostgreSQL integration** tests (`//go:build integration`).

## Quick commands

| Command | Scope | Postgres |
|---------|--------|----------|
| `make test` | API, agent, detection, plugins, database, shared `pkg` | No |
| `make api-test-integration` | Auth, RBAC, ingest, alerts/dedup, agent enroll, notifications, readiness | Yes (skips if unreachable) |
| `make test-all` | Unit + integration | Yes (integration skips if unreachable) |
| `make test-migrations` | Goose up/down cycle | Yes |
| `make openapi-validate` | OpenAPI lint + route coverage test | No |
| `./sentinel/scripts/run-unit-tests.sh` | `make test` + `openapi-validate` | No |
| `./sentinel/scripts/run-integration-tests.sh` | Migrations smoke + `api-test-integration` | Yes |

Set `TEST_DATABASE_URL` (or `DATABASE_URL` for migration scripts) to point at a disposable database. Default local DSN:

`postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable`

For CI jobs that must fail when Postgres is missing, run integration with `REQUIRE_INTEGRATION_DB=1` (see script).

## Test matrix

| Area | Location | Type | Notes |
|------|----------|------|-------|
| **Auth / session** | `api/internal/integration/auth_test.go` | Integration | Login, RBAC deny, expired session |
| **TOTP** | `api/internal/integration/auth_test.go` | Integration | Challenge + verify |
| **API keys** | `api/internal/integration/apikey_test.go` | Integration | Create, use bearer, revoke |
| **RBAC middleware** | `api/internal/middleware/rbac_test.go` | Unit | Permission allow/deny |
| **Principal / ADMIN** | `api/internal/auth/principal/principal_test.go` | Unit | Permission sets, role bypass |
| **Alerts RBAC** | `api/internal/handlers/alerts_rbac_unit_test.go` | Unit | Viewer cannot patch alerts |
| **Agent enroll + ingest** | `api/internal/handlers/agent_test.go` | Integration | Enroll, heartbeat, events |
| **Ingest idempotency / rate limit** | `api/internal/handlers/agent_test.go` | Integration | Dedup key `(agent_id, ingest_id)`, 429 |
| **Detection rules** | `detection/engine_test.go`, `detection/loader_test.go` | Unit | SSH brute-force, YAML load |
| **Alert dedup (in-memory)** | `api/internal/alerts/manager_test.go` | Unit | 100 events → 1 alert |
| **Alert lifecycle** | `api/internal/alerts/lifecycle_test.go` | Unit | Status transitions |
| **End-to-end dedup + lifecycle** | `api/internal/handlers/alerts_test.go` | Integration | Ingest → rule → DB dedup → PATCH |
| **WebSocket alerts** | `api/internal/handlers/ws_test.go`, `alerts_test.go` | Unit + integration | RBAC on upgrade; live fan-out |
| **Realtime hub** | `api/internal/realtime/hub_test.go` | Unit | Publish/subscribe/recent buffer |
| **Notifications** | `api/internal/handlers/notifications_test.go` | Integration | Channel CRUD + RBAC |
| **Plugins** | `plugins/loader`, `plugins/sdk` | Unit | Load policy, registry |
| **Database / migrations** | `database/migrate_test.go`, `scripts/test-migrations.sh` | Unit + script | Constraints, goose cycle |
| **OpenAPI parity** | `api/openapi/coverage_test.go` | Unit | Routes match spec |
| **Agent collectors** | `agent/internal/collector/...` | Unit | authlog/docker parse |
| **Crypto / secrets** | `api/internal/crypto/...` | Unit | Password hash, secret helpers |
| **Event normalization** | `pkg/event/normalize_test.go` | Unit | Canonical ingest shape |

Shared integration helpers: `api/internal/testutil` (build tag `integration`).

## Security-critical paths (priority)

1. **Authentication** — session expiry, TOTP, API key revoke (`integration/*`).
2. **Authorization** — RBAC on users, alerts, notifications, WebSocket (`middleware`, `handlers`).
3. **Ingest** — agent bearer only, idempotency, rate limits (`agent_test.go`).
4. **Detection + dedup** — rule match thresholds (`detection`), manager dedup (`alerts`), full pipeline (`alerts_test.go`).

## Adding tests

- Prefer **real assertions** over skipped placeholders; use `t.Skip` only when Postgres (or another service) is genuinely unavailable.
- Integration tests must include `//go:build integration` and live under packages already wired in `make api-test-integration`.
- Do not log secrets, enrollment tokens, or API keys in test output.
