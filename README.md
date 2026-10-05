# Sentinel

**MONITOR • DETECT • PROTECT**

Sentinel is an open-source security monitoring and lightweight SIEM platform for self-hosted infrastructure. It collects security events from Linux servers (and containers), evaluates them with configurable YAML rules, and provides centralized alerts, investigation workflows, and audit trails.

## Features (roadmap)

| Area | Description |
|------|-------------|
| **Collection** | Go agent on hosts for auth logs, web servers, systemd, firewall, Docker |
| **Control plane** | Go API — REST `/api/v1`, WebSockets, RBAC, ingestion, audit |
| **Detection** | YAML rule engine with possibility-oriented alert wording |
| **Operations** | Alert lifecycle, deduplication, notifications, plugins |
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

## Quick start (API only — Phase 2)

**Requirements:** Go 1.22+

```bash
cp .env.example .env   # optional; defaults work for local dev
make build
make test
make run-api
```

Verify health:

```bash
curl -s http://localhost:8080/healthz
curl -s http://localhost:8080/readyz
curl -s http://localhost:8080/api/v1
```

Optional lint (install [golangci-lint](https://golangci-lint.run/) first):

```bash
make lint
```

## Security

- **No secrets in git** — use `.env` locally (never commit it). See `.env.example`.
- **No default admin password or API keys** — bootstrap flows arrive in Phase 4 (auth).
- **Structured logs** — JSON to stdout; do not log credentials or tokens.
- **License** — not yet chosen; see `sentinel/docs/README.md` before distributing.

## Documentation

- In-repo: [`sentinel/docs/`](sentinel/docs/)
- API module: [`sentinel/api/README.md`](sentinel/api/README.md)

## Repository

[github.com/luca-staudt/Sentinel](https://github.com/luca-staudt/Sentinel)
