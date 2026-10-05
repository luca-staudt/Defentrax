<p align="center">
  <img src="sentinel/docs/assets/sentinel-logo.png" alt="Sentinel logo" width="160" />
</p>

<h1 align="center">Sentinel</h1>

<p align="center"><strong>MONITOR • DETECT • PROTECT</strong></p>

<p align="center">
  Open-source security monitoring and lightweight SIEM for self-hosted infrastructure.
</p>

---

Sentinel collects security-relevant events from Linux hosts (and optionally Docker), evaluates them with YAML detection rules, and gives operators centralized alerts, investigation workflows, notifications, and an audit trail — all under your control.

**Status:** pre-1.0 (`v0.1.0` line). Phases 2–19 are implemented on this branch stack; Phase 21 prepares a formal `v1.0.0` release. There is **no LICENSE file yet** — see [License](#license).

## Features

| Area | What works today |
|------|------------------|
| **Agent** | Go agent: auth/SSH log collection, heartbeats, optional Docker Engine events |
| **Control plane** | Go API — REST `/api/v1`, OpenAPI + Swagger UI, WebSockets for alerts, RBAC |
| **Auth** | Session cookies, API keys, TOTP 2FA + recovery codes, bootstrap-first-admin |
| **Detection** | YAML rule engine (SSH, Linux, nginx/Apache, firewall, Docker packs) |
| **Alerts** | Lifecycle `OPEN → ACKNOWLEDGED → INVESTIGATING → RESOLVED`, dedup, possibility wording |
| **Notifications** | Discord / Slack / email / webhook channels (secrets encrypted at rest) |
| **Plugins** | v1 SDK + allowlist/signature load policy (in-process; see docs) |
| **UI** | Next.js operator UI (dashboard, events, alerts, rules, servers) |
| **Deploy** | Docker Compose, Kubernetes manifests, Helm chart |
| **CI** | GitHub Actions: lint, test, security scans, SBOM, release workflow |

Honest gaps (not v1 yet): public audit API, agent mTLS, automated event retention jobs, image signing (cosign). Details: [`sentinel/docs/`](sentinel/docs/).

## Architecture

```
┌────────────┐     HTTPS / token      ┌──────────────────────────────────────┐
│  Agent(s)  │ ─────────────────────► │  API (Go)                            │
│  Linux     │   enroll / heartbeat   │  auth · ingest · detection worker    │
│  (+Docker) │   / events             │  alerts · notifications · plugins    │
└────────────┘                        └───────────┬──────────────┬───────────┘
                                                  │              │
                                           PostgreSQL         Redis
                                           (source of         (sessions /
                                            truth)             rate limits /
                                                               windows)
                                                  │
                                          ┌───────▼────────┐
                                          │  Frontend      │
                                          │  Next.js UI    │
                                          └────────────────┘
```

Repository layout:

```
sentinel/
  agent/          # Host collectors
  api/            # Control-plane HTTP API
  detection/      # Rule engine
  frontend/       # Next.js operator UI
  database/       # PostgreSQL migrations (goose)
  rules/          # Bundled detection rules
  plugins/        # Extension SDK + examples
  deployments/    # docker-compose, kubernetes, helm
  docs/           # Operator & developer docs
  scripts/        # Dev / CI helpers
  tests/          # Cross-module tests
```

More detail: [`sentinel/docs/architecture.md`](sentinel/docs/architecture.md).

## Screenshots

UI screenshots for docs will land with release polish (Phase 21). Until then, placeholders live under [`sentinel/docs/assets/screenshots/`](sentinel/docs/assets/screenshots/).

Expected captures: login, dashboard, alert detail, rules list.

## Quick start (Docker Compose)

**Requirements:** Docker Engine 24+ with Compose plugin.

```bash
git clone https://github.com/luca-staudt/Sentinel.git
cd Sentinel
cp .env.example .env

# Required secrets (never commit .env)
openssl rand -base64 24   # → POSTGRES_PASSWORD=
openssl rand -base64 32   # → SESSION_SECRET=
openssl rand -base64 32   # → TOTP_ENCRYPTION_KEY=

# Optional one-time first admin (only when users table is empty)
# SENTINEL_BOOTSTRAP_ADMIN_EMAIL=admin@example.com
# SENTINEL_BOOTSTRAP_ADMIN_PASSWORD='choose-a-long-password'

docker compose up -d --build
```

| Service | URL |
|---------|-----|
| UI | http://localhost:3000 |
| API health | http://localhost:8080/healthz |
| API ready | http://localhost:8080/readyz |
| OpenAPI / Swagger | http://localhost:8080/api/v1/docs |

Optional profiles: `--profile agent`, `--profile proxy` (Caddy on `:80`).  
Full guide: [`sentinel/docs/installation.md`](sentinel/docs/installation.md).

## Quick start (Kubernetes / Helm)

```bash
# Kubernetes (kustomize)
make k8s-dry-run
kubectl apply -k sentinel/deployments/kubernetes

# Helm
make helm-lint
helm upgrade --install sentinel sentinel/deployments/helm/sentinel \
  --namespace sentinel --create-namespace \
  --set secrets.postgresPassword=… --set secrets.sessionSecret=… \
  --set secrets.totpEncryptionKey=… --set secrets.secretsEncryptionKey=…
```

Do **not** commit real secrets. Prefer Sealed Secrets / External Secrets / a cloud secret manager in production.

## Quick start (bare metal)

**Requirements:** Go 1.22+, PostgreSQL 14+, Node 20+ (UI).

```bash
cp .env.example .env   # set DATABASE_URL / SESSION_SECRET
make build
export DATABASE_URL='postgres://user:pass@localhost:5432/sentinel?sslmode=disable'
make db-migrate-up
make test
make run-api
```

See [`sentinel/docs/configuration.md`](sentinel/docs/configuration.md) and [`sentinel/docs/testing.md`](sentinel/docs/testing.md).

## Security

- No secrets in git — use `.env` locally (never commit it). See `.env.example`.
- No default admin password or API keys — bootstrap or explicit dev seed only.
- Hardening: [`SECURITY.md`](SECURITY.md) · [`sentinel/docs/security.md`](sentinel/docs/security.md).
- Report vulnerabilities privately — see [`SECURITY.md`](SECURITY.md).

## Documentation

| Topic | Link |
|-------|------|
| Docs index | [`sentinel/docs/`](sentinel/docs/) |
| Architecture | [`architecture.md`](sentinel/docs/architecture.md) |
| Install | [`installation.md`](sentinel/docs/installation.md) |
| Configuration | [`configuration.md`](sentinel/docs/configuration.md) |
| Agent | [`agent.md`](sentinel/docs/agent.md) |
| Detection / rules | [`detection-engine.md`](sentinel/docs/detection-engine.md) · [`rules.md`](sentinel/docs/rules.md) |
| API | [`api.md`](sentinel/docs/api.md) |
| Security | [`security.md`](sentinel/docs/security.md) · [`SECURITY.md`](SECURITY.md) |
| Deploy | [`deployment.md`](sentinel/docs/deployment.md) |
| Plugins | [`plugins.md`](sentinel/docs/plugins.md) |
| Privacy / retention / backup | [`privacy.md`](sentinel/docs/privacy.md) · [`retention.md`](sentinel/docs/retention.md) · [`backup.md`](sentinel/docs/backup.md) |
| Troubleshooting | [`troubleshooting.md`](sentinel/docs/troubleshooting.md) |
| Contributing | [`CONTRIBUTING.md`](CONTRIBUTING.md) |
| Roadmap | [`ROADMAP.md`](ROADMAP.md) |
| Changelog | [`CHANGELOG.md`](CHANGELOG.md) |

## License

**No `LICENSE` file is present.** Sentinel is intended as open source, but redistribution terms are **not finalized**.

**Maintainer recommendation (pending decision):**

| Option | Why |
|--------|-----|
| **Apache-2.0** (preferred) | Explicit patent grant; familiar to enterprises |
| **MIT** | Minimal friction for contributors and embedders |

Do **not** add a `LICENSE` file until the maintainer records an explicit choice. See also [`sentinel/docs/README.md`](sentinel/docs/README.md).

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md) and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Repository

[github.com/luca-staudt/Sentinel](https://github.com/luca-staudt/Sentinel)
