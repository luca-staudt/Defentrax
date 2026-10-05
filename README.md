# Sentinel

**MONITOR • DETECT • PROTECT**

Sentinel is an open-source security monitoring and lightweight SIEM platform for self-hosted infrastructure. It collects security events from Linux servers (and containers), evaluates them with configurable YAML rules, and provides centralized alerts, investigation workflows, and audit trails.

## Features (roadmap)

| Area | Description |
|------|-------------|
| **Collection** | Go agent on hosts for auth logs, web servers, systemd, firewall, Docker |
| **Control plane** | Go API — REST `/api/v1`, WebSockets, RBAC, ingestion, audit |
| **Detection** | YAML rule engine with possibility-oriented alert wording |
| **Operations** | Alert lifecycle, deduplication, notifications, plugin SDK (v1) |
| **Deploy** | Docker Compose, Kubernetes, Helm |

Implementation is phased; see `sentinel/docs/` for secure-default notes and in-repo documentation stubs.

## Architecture

```
sentinel/
  agent/          # Host collectors
  api/            # Control-plane HTTP API (Phase 2+)
  detection/      # Rule engine
  frontend/       # Next.js operator UI
  database/       # PostgreSQL migrations
  rules/          # Bundled detection rules
  plugins/        # Extension SDK
  deployments/    # docker-compose, kubernetes, helm
  docs/           # Operator & developer docs
  scripts/        # Dev helpers
  tests/          # Cross-module integration tests
```

Shared Go packages stay inside `api/internal` unless a deliberate shared `pkg/` is introduced for agent/API types.

## Quick start (API + database — Phase 3)

**Requirements:** Go 1.22+, PostgreSQL 14+

```bash
cp .env.example .env   # set DATABASE_URL for your local Postgres
make build
export DATABASE_URL='postgres://user:pass@localhost:5432/sentinel?sslmode=disable'
make db-migrate-up
make test
make run-api
```

Optional dev RBAC seed (development only — never in production):

```bash
export APP_ENV=development SENTINEL_SEED_DEV=true
# optional: SENTINEL_DEV_ADMIN_PASSWORD=...  # local .env only, never commit
make db-seed-dev
```

Verify health:

```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/readyz
curl -s http://localhost:8080/api/v1
```

Migration integration script: `./sentinel/scripts/test-migrations.sh`

Optional lint (install [golangci-lint](https://golangci-lint.run/) first):

```bash
make lint
```

## Security

- **No secrets in git** — use `.env` locally (never commit it). See `.env.example`.
- **No default admin password or API keys** — Phase 4 adds secure bootstrap; dev seed only with explicit env flags.
- **Migrations:** [goose](https://github.com/pressly/goose) in `sentinel/database/` — see `sentinel/database/README.md`.
- **Structured logs** — JSON to stdout; do not log credentials or tokens.
- **License** — not yet chosen; see `sentinel/docs/README.md` before distributing.

## Documentation

- In-repo: [`sentinel/docs/`](sentinel/docs/)
- API (OpenAPI): [`sentinel/docs/api.md`](sentinel/docs/api.md) · [`sentinel/api/openapi/openapi.yaml`](sentinel/api/openapi/openapi.yaml)
- Plugins: [`sentinel/docs/plugins.md`](sentinel/docs/plugins.md)
- API module: [`sentinel/api/README.md`](sentinel/api/README.md)

## Repository

[github.com/luca-staudt/Sentinel](https://github.com/luca-staudt/Sentinel)
