# Compatibility notes

Versions Sentinel **expects** for the `VERSION` / `v0.1.0` line. This is an
operator matrix, not a marketing claim of universal platform support.

## Product version

| Artifact | Source of truth |
|----------|-----------------|
| SemVer (no leading `v`) | Repository root [`VERSION`](../../VERSION) |
| Go embed (API / agent defaults) | [`sentinel/pkg/version`](../pkg/version) |
| OpenAPI `info.version` | [`sentinel/api/openapi/openapi.yaml`](../api/openapi/openapi.yaml) |
| Frontend `package.json` | [`sentinel/frontend/package.json`](../frontend/package.json) |
| Helm `version` / `appVersion` / default image tag | [`deployments/helm/sentinel`](../deployments/helm/sentinel) |
| Compose image tag default | `SENTINEL_IMAGE_TAG` (default `0.1.0`) in root `docker-compose.yml` |

Bump all of the above together. Validate with:

```bash
./sentinel/scripts/release-check.sh
```

## Runtime (self-host)

| Component | Compatible / tested baseline | Notes |
|-----------|------------------------------|--------|
| Go toolchain | **1.22.x** | Matches CI `setup-go` |
| Node.js (frontend build) | **20.x** LTS (CI / local) | Next.js 15 app |
| PostgreSQL | **16.x** | Compose / K8s / Helm defaults use 16 |
| Redis | **7.x** | Cache / rate-limit / session helpers — not durable SoT |
| Kubernetes | **≥ 1.27** | Helm `kubeVersion` |
| Docker Engine (optional agent collector) | API **v1.41** client | Observe-only; socket access required |
| Linux hosts (agent) | systemd/journald or `/var/log/auth.log` | Authlog collector; Docker collector optional |

## Known capability gaps vs. long-term v1.0 brief

These do **not** block a cautious `v0.1.0` tag, but they **do** block calling the
release `v1.0.0`:

| Area | Status on this branch stack |
|------|-----------------------------|
| Authlog + Docker collectors | Implemented |
| Dedicated nginx / apache / firewall / full systemd collectors | **Not implemented** (rule packs exist; events must be supplied by other means / future collectors) |
| Public audit-log HTTP API | **Missing** (rows written server-side) |
| Automated retention / purge job | **Missing** (operator SQL / policy) |
| Agent ↔ API mTLS | **Missing** |
| Cosign / signed images in CI | **Missing** (checksums + local SBOM documented) |
| `LICENSE` file | **Missing** — maintainer decision |
| Phase PR stack merged to `main` | **Incomplete** (only early phases on `main` at prep time) |

## Upgrade expectations

- **0.1.x → 0.1.y:** run DB migrations; review Changelog; no promised zero-downtime HA story yet.
- **0.1.x → 1.0.0 (future):** only after the readiness checklist in the project
  `docs/v1-readiness.md` is honestly green (license, merge, collectors, residual security items).

## Related

- [release.md](release.md)
- [ci.md](ci.md)
- [installation.md](installation.md)
