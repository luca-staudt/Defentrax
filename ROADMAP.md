# Sentinel roadmap

Living plan from the first tagged pre-release **`v0.1.0`** toward a production-ready
**`v1.0.0`**. Items below are direction, not delivery dates.

## Completed (phases 1–21 on `main`)

| Phase | Topic |
|-------|--------|
| 1 | Repo analysis & architecture baseline |
| 2 | Backend foundation |
| 3 | Database schema & migrations |
| 4 | Authentication & RBAC |
| 5 | Agent |
| 6 | Event ingestion |
| 7 | Detection engine |
| 8 | Alert system |
| 9 | Frontend |
| 10 | Notifications |
| 11 | Docker monitoring |
| 12 | Plugin system |
| 13 | API / OpenAPI docs |
| 14 | Testing matrix |
| 15 | Docker Compose deployment |
| 16 | Kubernetes manifests |
| 17 | Helm chart |
| 18 | CI/CD |
| 19 | Security hardening |
| 20 | Documentation |
| 21 | Release prep + first tagged pre-release (`v0.1.0`) |

## Release line concept

| Release | Theme | Focus |
|---------|-------|--------|
| **v0.1.0** (this pre-release) | **Preview foundation** | Self-hostable Compose stack: API, agent enrollment, detection, alerts, operator UI, notifications |
| **v0.1.x** | **Stabilize preview** | Bugfixes, install/upgrade polish, clearer operator docs, UI/API consistency |
| **v0.2.0** | **Operator depth** | More log collectors, automated retention/purge, public audit-log API + UI |
| **v0.3.0** | **Hardening** | Agent ↔ API mTLS, cosign/signed images, broader rule packs, GeoIP optional |
| **v1.0.0** | **Production public** | LICENSE decided, readiness checklist green, stable upgrade path |

## After `v0.1.0` (candidates — not promises)

- Close v1.0 checklist gaps (license, collectors, audit API, retention job, mTLS, cosign)
- Public audit-log API and UI
- Automated retention / purge jobs with operator policy
- Agent ↔ API mTLS
- Cosign / signed release images in CI
- Hot-reload for detection rule files
- Optional GeoIP enrichment (off by default)
- OIDC / SSO
- Broader log sources and rule packs
- Multi-replica rate-limit refinements already partly covered by Redis

## Non-goals for the first tag / pre-release

- Calling the release `v1.0.0` while LICENSE / collector / hardening gaps remain
- Multi-tenant SaaS isolation
- Guaranteed “attacker detected” claims (alerts stay possibility-oriented)
- Shipping default admin passwords or API keys
- Adding a `LICENSE` file without an explicit maintainer decision

## Tracking

Changelog: [`CHANGELOG.md`](CHANGELOG.md).  
Release process: [`sentinel/docs/release.md`](sentinel/docs/release.md).  
Compatibility: [`sentinel/docs/compatibility.md`](sentinel/docs/compatibility.md).
