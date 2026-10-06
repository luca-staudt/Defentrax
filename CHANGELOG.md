# Changelog

All notable changes to Defentrax are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- Default detection rules can be edited from the Rules page. Edits stay in place across restarts. The rule form explains each field. The sidebar always links to https://defentrax.de.
- Operators with `rules:write` can create custom detection rules from the Rules page. New rules are stored and evaluated by the engine, including after a restart.
- Page permissions (`pages:dashboard`, `pages:alerts`, `pages:alert_detail`, `pages:events`, `pages:servers`, `pages:server_detail`, `pages:rules`, `pages:notifications`, `pages:team`, `pages:roles`, `pages:audit`) so a role can be granted each panel screen separately. The sidebar and direct URLs follow those keys. Existing roles keep the screens their read permissions already allowed.
- Team accounts admin: user lifecycle (create/edit/disable, password reset, session revoke, admin 2FA reset)
- Roles & permissions management API + panel UI (custom roles, `roles:read`/`roles:write`)
- Built-in `SUPER_ADMIN` role (alongside legacy `ADMIN` bypass)
- Permission keys: `servers:read`, `roles:*`, `settings:*`, `audit_logs:export`
- Panel pages: `/users` (Team), `/roles`

### Changed

- Server list/detail now requires `servers:read` (create/tokens still `servers:write`)
- `/auth/me` returns real `display_name`, `is_active`, timestamps, and `totp_enabled`

## [0.1.0] — 2026-10-05

First formal tagged **pre-release**. This is an early, self-hostable preview of the
Defentrax SIEM control plane — **not** a finished `v1.0.0` product. Expect gaps,
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

[Unreleased]: https://github.com/luca-staudt/Defentrax/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/luca-staudt/Defentrax/releases/tag/v0.1.0
