# Architecture

Sentinel is a **single-tenant, self-hosted** security monitoring stack: agents collect host events, the API persists and evaluates them, and operators work through a web UI and REST API.

## High-level components

| Component | Language | Role |
|-----------|----------|------|
| **Agent** | Go | Runs on monitored hosts; enrolls; heartbeats; uploads normalized events |
| **API** | Go | Auth/RBAC, ingestion, detection worker, alerts, notifications, plugins, OpenAPI |
| **Detection** | Go package | Loads YAML rules; matches events; proposes alerts (possibility wording) |
| **Frontend** | Next.js | Operator UI (dashboard, events, alerts, rules, servers) |
| **PostgreSQL** | — | Source of truth (users, agents, events, alerts, audit rows, …) |
| **Redis** | — | Sessions/rate-limit/detection windows when configured — **not** durable storage |

```
Agents ──HTTPS + bearer──► API ◄── session / API key ── Operators (UI / curl)
                              │
                     ┌────────┴────────┐
                     ▼                 ▼
                PostgreSQL           Redis
```

## Trust boundaries

1. **Internet → API/UI** — TLS at reverse proxy or process; session cookies `HttpOnly`/`Secure`/`SameSite`; CORS allowlist; Origin guard on cookie mutations.
2. **Agent → API** — Enrollment token (`senr_…`) once, then agent token (`sagt_…`) hashed at rest. Scope: enroll / heartbeat / ingest only. **No mTLS in v1.**
3. **Operator → API** — Session cookie or `sent_…` API key; RBAC enforced server-side.
4. **Plugins** — Loaded into the API process from an allowlisted directory; optional Ed25519 signature. Empty allowlist admits nothing.

Details: [security.md](security.md).

## Data flow (happy path)

1. Admin creates a **server** and an **enrollment token**.
2. Agent enrolls, stores credentials (`0600`), heartbeats, and uploads events.
3. API inserts events (idempotent where fingerprinting applies), then the **detection worker** evaluates enabled rules.
4. Matching rules create or refresh **alerts** (dedup cooldown); WebSocket clients get updates; notification rules may fire.
5. Sensitive actions write **audit_logs** rows (listable via `GET /api/v1/audit-logs` with `audit_logs:read`).

## Module layout

```
sentinel/
  agent/        # collectors + enroll client
  api/          # HTTP server, stores, workers
  detection/    # rule load / match / windows
  frontend/     # App Router UI
  database/     # goose migrations + seed (dev only)
  rules/        # shipped YAML packs
  plugins/      # SDK + example plugins
  deployments/  # compose / k8s / helm
  docs/         # this documentation
```

Shared wire types for events live in `sentinel/pkg/event`. Prefer `api/internal/…` for control-plane internals — avoid a large shared monolith package.

## Roles

| Role | Intent |
|------|--------|
| `ADMIN` | Full administration |
| `SECURITY_ANALYST` | Investigate alerts, tune detection |
| `OPERATOR` | Manage servers, agents, notifications |
| `VIEWER` | Read-only |

All permission checks are server-side (`resource:action` pairs).

## Alert lifecycle

`OPEN` → `ACKNOWLEDGED` → `INVESTIGATING` → `RESOLVED`

Alert titles/descriptions use **possibility language** (“Possible SSH brute-force…”) — never definitive “attacker detected”.

## Deploy topologies

| Topology | Doc |
|----------|-----|
| Docker Compose | [installation.md](installation.md), [deployment.md](deployment.md) |
| Kubernetes | [../deployments/kubernetes/README.md](../deployments/kubernetes/README.md) |
| Helm | [../deployments/helm/sentinel/README.md](../deployments/helm/sentinel/README.md) |

## Related

- [configuration.md](configuration.md) — environment variables
- [agent.md](agent.md) — enrollment and collectors
- [detection-engine.md](detection-engine.md) · [rules.md](rules.md)
- [api.md](api.md) — REST / OpenAPI
- [privacy.md](privacy.md) · [retention.md](retention.md) · [backup.md](backup.md)
