# Sentinel roadmap

Living plan for the `v0.1.0` → `v1.0.0` line. Status reflects the phase branch
stack (not every PR is merged to `main` yet).

## Completed (phases 1–20 on branch stack)

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

## In progress / next

| Phase | Topic | Notes |
|-------|--------|-------|
| **21** | Release prep | VERSION wiring, release-check, SBOM/checksum process. **Honest verdict: tag `v0.1.0` first — not `v1.0.0`.** See [release.md](sentinel/docs/release.md) and project `docs/v1-readiness.md`. |

## After first tagged release (candidates — not committed)

These are ideas, not promises or schedules:

- Close v1.0 checklist gaps (license, merge stack, collectors, audit API, retention job, mTLS, cosign)
- Public audit-log API and UI
- Automated retention / purge jobs with operator policy
- Agent ↔ API mTLS
- Cosign / signed release images in CI
- Hot-reload for detection rule files
- Optional GeoIP enrichment (off by default)
- OIDC / SSO
- Broader log sources and rule packs
- Multi-replica rate-limit refinements already partly covered by Redis

## Non-goals for the first tag

- Calling the release `v1.0.0` while LICENSE / merge / collector gaps remain
- Multi-tenant SaaS isolation
- Guaranteed “attacker detected” claims (alerts stay possibility-oriented)
- Shipping default admin passwords or API keys
- Adding a `LICENSE` file without an explicit maintainer decision

## Tracking

Implementation plan (store): project `docs/implementation-plan.md`.  
Changelog: [`CHANGELOG.md`](CHANGELOG.md).  
Compatibility: [`sentinel/docs/compatibility.md`](sentinel/docs/compatibility.md).
