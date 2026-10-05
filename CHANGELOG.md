# Changelog

All notable changes to Sentinel are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

Pre-1.0 development on the phase branch stack. No formal SemVer tag beyond the
Compose/Helm `0.1.0` image/chart line yet. A tagged `v1.0.0` is planned in
Phase 21 (release prep).

### Added

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

### Security

- See [`SECURITY.md`](SECURITY.md) and [`sentinel/docs/security.md`](sentinel/docs/security.md).

### Known gaps (honest)

- No `LICENSE` file (maintainer decision pending)
- No public audit-log HTTP API yet (rows are written)
- No automated event retention job yet (operator-managed; see retention docs)
- No agent mTLS; no cosign image signing (planned for release prep)

## [0.1.0] — development line

Compose `SENTINEL_IMAGE_TAG` / Helm `appVersion` default. Not a GitHub Release
artifact set until Phase 21.

---

[Unreleased]: https://github.com/luca-staudt/Sentinel/compare/main...HEAD
