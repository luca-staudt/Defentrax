# Changelog

All notable changes to Defentrax are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Panel-first Compose agent enrollment: server detail shows a one-shot `docker compose run -e SENTINEL_ENROLLMENT_TOKEN=…` command; credentials persist in the `agent_data` volume (no permanent `.env` token)
- `SENTINEL_ENROLL_ONLY` for one-shot enroll-then-exit; agent waits for credentials on disk instead of crash-looping when no token is set
- Intervention `dry_run` setting (DB + panel switch); agents receive `intervention.dry_run` on heartbeat and prefer it over env

### Changed

- Compose project/service/container/network names renamed to `defentrax-*` / `defentrax-net` (DNS: `http://defentrax-api:8080`); volume **external** names stay `sentinel-*-data` for data continuity
- Migrate entrypoint fails fast on Postgres auth/config errors (stops long Compose “Waiting” on bad `POSTGRES_PASSWORD`)
- Compose `defentrax-agent` no longer reads `SENTINEL_ENROLLMENT_TOKEN` from `.env` for ongoing runs
- `SENTINEL_INTERVENTION_DRY_RUN` is an optional override only when explicitly set
- Compose local image tags renamed to `defentrax-*` with `pull_policy: build` (no Docker Hub pull)
- User-facing runtime strings: API/agent startup logs, `/api/v1` `service` field, and webhook `source` use **Defentrax**
- Migrate entrypoint prints last DB error + password/volume hints; docs note `docker compose logs migrate`

## [0.3.0] — 2026-10-08

Third tagged **pre-release**. Operator-panel feature set on top of `v0.2.0`,
including the Velzon theme rebuild that landed after that tag. Still **not** a
finished `v1.0.0` — expect gaps and breaking changes before production-ready.

**SemVer choice:** minor bump (`0.2.0` → `0.3.0`, not `0.2.1`). `v0.2.0` is already
a published pre-release (tag on `99718fa`, 2026-10-06). This delta
is a feature set — shared panel cache, access workspace, list/detail pages,
dashboard charts, silence windows, saved views, delivery history, and
English/German — not a patch-only line of fixes. The earlier sketch that reserved
`v0.3.0` for collectors and hardening has not shipped; that work moves to `v0.4.0`.

### Added

- Shared panel data cache so dashboard stats, alerts, events, and the header read one copy, refreshed by a single poll and the alert socket
- Access workspace: grant pages, view and change rights, and people from one screen; team assignment uses the same role cards
- List-and-detail operator pages for overview, alerts, events, audit, fleet, rules, dispatch, people, and sign-in
- Velzon dashboard charts from live stats (open alerts, 24h events, servers, coverage), template header with the notification bell, and a sidebar profile pinned in the rail
- Silence windows for detection rules and hosts (matching events still arrive; no new alert opens during the window)
- Silent hosts count beside open alerts (no recent heartbeat or event)
- Saved alert and event views (named filters, optional default for the queue)
- Notification delivery log on each channel
- English / German language select

### Changed

- Operator panel rebuilt on the Velzon theme (layout, styles, and icons) with the existing Defentrax auth, page permissions, and API behavior
- Sidebar wordmark hides when the rail is collapsed
- Alert resolve can skip forward states and reopen; the Alerts and Events pages surface the API error

### Upgrade

- Rebuild and restart `sentinel-api` and `sentinel-frontend` (`SENTINEL_IMAGE_TAG=0.3.0`)
- Migration `00010_silence_and_views.sql` (silence windows and saved views) runs with the API before the new process serves traffic

### Known gaps (unchanged blockers for `v1.0.0`)

- No `LICENSE` file (maintainer decision pending)
- No dedicated nginx / apache / firewall / full systemd collectors
- No automated event retention job yet
- No agent mTLS; cosign image signing not in CI
- Production HTTPS / cookie hardening still operator-owned

### Forward path

| Tag | Intent |
|-----|--------|
| **v0.3.x** | Stabilize this panel line: bugfixes, install/upgrade polish |
| **v0.4.0** | Broader collectors + automated retention + hardening (mTLS, signed images) |
| **v1.0.0** | Production-ready public release once LICENSE + readiness checklist are green |

## [0.2.0] — 2026-10-06

Second tagged **pre-release**. Product rebrand to **Defentrax**, GitHub repo rename,
and substantial operator-depth features on top of `v0.1.0`. Still **not** a finished
`v1.0.0` — expect gaps and breaking changes before production-ready.

**SemVer choice:** minor bump (`0.1.0` → `0.2.0`) because Team Accounts / RBAC,
per-page permissions, custom detection rules, and a full operator UI remake landed —
not a patch-only line of fixes and docs.

### Added

- Team accounts admin: user lifecycle (create/edit/disable, password reset, session revoke, admin 2FA reset)
- Roles & permissions management API + panel UI (custom roles, `roles:read`/`roles:write`)
- Built-in `SUPER_ADMIN` role (alongside legacy `ADMIN` bypass)
- Permission keys: `servers:read`, `roles:*`, `settings:*`, `audit_logs:export`
- Page permissions (`pages:dashboard`, `pages:alerts`, `pages:alert_detail`, `pages:events`, `pages:servers`, `pages:server_detail`, `pages:rules`, `pages:notifications`, `pages:team`, `pages:roles`, `pages:audit`) so a role can be granted each panel screen separately
- Panel pages: `/users` (Team), `/roles`
- Operators can create custom detection rules and edit bundled rules from the Rules page
- Notification channel test action, audit logs UI, clipboard copy fallback for enrollment tokens
- Defentrax brand assets (UI logo, favicon, docs lockup) and Core Guard operator UI remake (SOC layout, telemetry charts, alert console, roles/users/notifications polish)

### Changed

- Product / docs / UI branding: **Sentinel → Defentrax** (code paths and Compose service names still use `sentinel/` / `sentinel-*` identifiers)
- GitHub module and clone URLs retargeted to `luca-staudt/Defentrax`
- Server list/detail now requires `servers:read` (create/tokens still `servers:write`)
- `/auth/me` returns real `display_name`, `is_active`, timestamps, and `totp_enabled`
- Frontend production build fixes after the UI remake (WebSocket / build path)

### Fixed

- CI unblocked after Defentrax rename
- Frontend production build after UI remake

### Known gaps (unchanged blockers for `v1.0.0`)

- No `LICENSE` file (maintainer decision pending)
- No dedicated nginx / apache / firewall / full systemd collectors
- No automated event retention job yet
- No agent mTLS; cosign image signing not in CI
- Production HTTPS / cookie hardening still operator-owned

### Forward path

| Tag | Intent |
|-----|--------|
| **v0.2.x** | Stabilize this operator-depth line: install/upgrade polish, bugfixes |
| **v0.3.0** | Broader collectors + automated retention + hardening (mTLS, signed images) |
| **v1.0.0** | Production-ready public release once LICENSE + readiness checklist are green |

## [0.1.0] — 2026-10-05

First formal tagged **pre-release**. This is an early, self-hostable preview of the
SIEM control plane — **not** a finished `v1.0.0` product. Expect gaps,
rough edges, and breaking changes before a production-ready line.

### Added

- Backend foundation: Go API scaffold, health/ready probes, structured logging
- PostgreSQL schema and goose migrations
- Authentication: sessions, API keys, TOTP 2FA, RBAC roles
- Host agent: enrollment tokens, heartbeats, authlog collection, optional Docker events
- Event ingestion with batching and rate limits
- Detection engine + bundled YAML rule packs
- Alert lifecycle, deduplication, WebSocket updates
- Next.js operator UI (dashboard, servers, alerts, events, rules, notifications)
- Operator UI: create servers, manage enrollment tokens, configure notification channels/rules
- Notification channels (Discord, Slack, email, webhook)
- Plugin system v1 (SDK, allowlist, optional signatures)
- OpenAPI 3 spec + Swagger UI
- Organized unit/integration test suite
- Docker Compose stack (multi-stage, non-root images)
- Kubernetes manifests and Helm chart
- GitHub Actions CI/CD (lint, test, security, SBOM, release workflow)
- Security hardening: headers, CSRF/Origin guard, rate limits, TLS options, gitleaks/gosec/Trivy/Dependabot
- Operator documentation pack (install, architecture, configuration, privacy/retention/backup, troubleshooting)
- Release prep: VERSION wiring, checklist script, SBOM/checksum commands

### Security

- See [`SECURITY.md`](SECURITY.md) and [`sentinel/docs/security.md`](sentinel/docs/security.md).

### Known gaps (honest — block `v1.0.0`, acceptable for a cautious `v0.1.0` pre-release)

- No `LICENSE` file (maintainer decision pending) — **blocks public OSS v1.0**
- No dedicated nginx / apache / firewall / full systemd collectors (rules exist)
- No public audit-log HTTP API yet (rows are written)
- No automated event retention job yet (operator-managed; see retention docs)
- No agent mTLS; cosign image signing not in CI (checksums documented)
- Production HTTPS / cookie hardening still operator-owned (`ALLOW_INSECURE_COOKIES` for HTTP labs)

### Forward path (planned line — not a schedule)

| Tag | Intent |
|-----|--------|
| **v0.1.x** | Stabilize this preview: install docs, operator UX fixes, bugfixes |
| **v0.2.0** | Broader collectors + automated retention + public audit API/UI |
| **v0.3.0** | Hardening: agent mTLS, signed release images, richer rule packs |
| **v1.0.0** | Production-ready public release once LICENSE + readiness checklist are green |

---

[Unreleased]: https://github.com/luca-staudt/Defentrax/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/luca-staudt/Defentrax/releases/tag/v0.3.0
[0.2.0]: https://github.com/luca-staudt/Defentrax/releases/tag/v0.2.0
[0.1.0]: https://github.com/luca-staudt/Defentrax/releases/tag/v0.1.0
