# Changelog

All notable changes to Sentinel are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

Phase 21 release-prep tooling on the phase branch stack. **Not** a `v1.0.0`
claim — first formal tag should be **`v0.1.0`** once this lands on `main` and
maintainer gates (especially LICENSE) are accepted.

### Added

- Canonical root `VERSION` + `sentinel/pkg/version` (API `/api/v1` + agent default)
- `scripts/release-check.sh`, `release-checksums.sh`, `release-sbom-local.sh`
- `make release-check` / `make release-sbom-local`; `test-ci` includes release-check
- Operator docs: expanded [release.md](sentinel/docs/release.md), new
  [compatibility.md](sentinel/docs/compatibility.md)

### Changed

- Agent default version no longer `0.5.0-dev`; uses shared package version
- Docker API/agent builds stamp `buildVersion` from `VERSION`

## [0.1.0] — planned first tag

Compose / Helm / OpenAPI / frontend already carry the `0.1.0` line. Treat the
GitHub Release of `v0.1.0` as the **first** formal artifact set (SBOM + checksums),
not as feature-complete `v1.0.0`.

### Added (development line → first tag)

- Backend foundation: Go API scaffold, health/ready probes, structured logging
- PostgreSQL schema and goose migrations
- Authentication: sessions, API keys, TOTP 2FA, RBAC roles
- Host agent: enrollment, heartbeats, authlog collection, optional Docker events
- Event ingestion with batching and rate limits
- Detection engine + bundled YAML rule packs
- Alert lifecycle, deduplication, WebSocket updates
- Next.js operator UI
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

### Known gaps (honest — block `v1.0.0`, not necessarily a cautious `v0.1.0`)

- No `LICENSE` file (maintainer decision pending) — **blocks public OSS v1.0**
- Phase PR stack largely still draft / not on `main`
- No dedicated nginx / apache / firewall / full systemd collectors (rules exist)
- No public audit-log HTTP API yet (rows are written)
- No automated event retention job yet (operator-managed; see retention docs)
- No agent mTLS; cosign image signing not in CI (checksums documented)

---

[Unreleased]: https://github.com/luca-staudt/Sentinel/compare/main...HEAD
[0.1.0]: https://github.com/luca-staudt/Sentinel/releases/tag/v0.1.0
