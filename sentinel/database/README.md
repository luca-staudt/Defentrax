# Defentrax Database

PostgreSQL schema migrations, constraints, and **development-only** seeds.

## Migration tool

This module uses **[goose](https://github.com/pressly/goose)** (embedded SQL migrations under `migrations/`).

## Environment

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | yes (migrate/seed) | PostgreSQL DSN, e.g. `postgres://user:pass@localhost:5432/sentinel?sslmode=disable` |
| `APP_ENV` | seed | Must be `development` for dev seed |
| `SENTINEL_SEED_DEV` | seed | Must be `true` to allow dev seed |
| `SENTINEL_DEV_ADMIN_PASSWORD` | optional | If set (with seed flags), creates/updates a dev admin user — **never commit a value** |
| `SENTINEL_DEV_ADMIN_EMAIL` | optional | Dev admin email (default `admin@localhost`) |

## Commands

From the repository root (see root `Makefile`):

```bash
make db-migrate-up
make db-migrate-down
make db-seed-dev   # requires APP_ENV=development and SENTINEL_SEED_DEV=true
make db-test
```

Or directly:

```bash
cd sentinel/database
DATABASE_URL='postgres://...' go run ./cmd/migrate up
DATABASE_URL='postgres://...' go run ./cmd/migrate down
```

Integration script (up/down cycle):

```bash
./sentinel/scripts/test-migrations.sh
```

## Schema

All minimum tables from the implementation plan: users/RBAC, servers/agents/tokens, events, alerts/rules, notifications, audit, auth artifacts, plugins, server metrics.

Important constraints:

- Password and token columns store **hashes only** (length checks; no plaintext).
- `alerts.status` lifecycle: `OPEN`, `ACKNOWLEDGED`, `INVESTIGATING`, `RESOLVED`.
- Unique `(agent_id, ingest_id)` on `events` for ingestion idempotency.

## Production bootstrap (Phase 4)

Phase 3 does **not** ship authentication. For production:

1. Run migrations (`make db-migrate-up`).
2. **Do not** enable `SENTINEL_SEED_DEV` in production.
3. Phase 4 will provide a secure first-admin bootstrap (CLI or one-time enrollment token) — no default password in the repository.

Development optional admin: set `SENTINEL_DEV_ADMIN_PASSWORD` only in local `.env` when running `make db-seed-dev`.

## Will not

- Contain business logic.
- Auto-seed production or ship default admin credentials.
