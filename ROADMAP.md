# Sentinel roadmap

Living plan for the `v0.1.0` → `v1.0.0` line. Status reflects the phase branch
stack (not every PR is merged to `main` yet).

## Completed (phases 1–19)

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

## In progress / next

| Phase | Topic | Notes |
|-------|--------|-------|
| **20** | Documentation | This pack — operator self-serve docs, community files, templates |
| **21** | v1.0 release prep | Changelog freeze, SemVer tag `v1.0.0`, checksums/signatures, compatibility notes, **license finalization** |

## After v1.0 (candidates — not committed)

These are ideas, not promises or schedules:

- Public audit-log API and UI
- Automated retention / purge jobs with operator policy
- Agent ↔ API mTLS
- Cosign / signed release images
- Hot-reload for detection rule files
- Optional GeoIP enrichment (off by default)
- OIDC / SSO
- Broader log sources and rule packs
- Multi-replica rate-limit refinements already partly covered by Redis

## Non-goals for v1

- Multi-tenant SaaS isolation
- Guaranteed “attacker detected” claims (alerts stay possibility-oriented)
- Shipping default admin passwords or API keys
- Adding a `LICENSE` file without an explicit maintainer decision

## Tracking

Implementation plan (store): project `docs/implementation-plan.md`.  
Changelog: [`CHANGELOG.md`](CHANGELOG.md).
