# Release process

How Sentinel builds and publishes release artifacts **today**, and what remains for Phase 21.

## Versions

| Line | Meaning |
|------|---------|
| Compose / Helm `0.1.0` | Current development image/chart app version |
| Git tags `v*` | Trigger the **Release** GitHub Actions workflow |
| `v1.0.0` | Planned formal release (Phase 21) |

Follow [SemVer](https://semver.org/). Document user-facing changes in [`CHANGELOG.md`](../../CHANGELOG.md).

## Preconditions

1. Target commit is green on **Main** CI ([ci.md](ci.md)).
2. Security scans reviewed (gitleaks, gosec, Trivy, Dependabot backlog).
3. OpenAPI coverage test passes (`make openapi-validate` / CI).
4. Docs match behavior (especially env vars and breaking changes).
5. **License:** do not run a public “OSS release” marketing push until a `LICENSE` decision is recorded. Workflows may still produce artifacts for maintainers.

## Tag and workflow

```bash
git checkout main   # or the release integration branch
git pull
git tag -a v0.1.0 -m "v0.1.0"
git push origin v0.1.0
```

Alternatively: Actions → **Release** → `workflow_dispatch` with a tag label.

The Release workflow ([`.github/workflows/release.yml`](../../.github/workflows/release.yml)) runs full tests, security jobs, image builds, and SBOM generation. Details: [ci.md](ci.md#release-workflow).

## Maintainer checklist (post-workflow)

1. Download SBOM / API image artifacts from the workflow run.
2. Push immutable image tags to **your** registry (not automated to a public registry in-tree yet).
3. Align Compose `SENTINEL_IMAGE_TAG` and Helm `appVersion` / image tags.
4. Draft GitHub Release notes from `CHANGELOG.md`; attach checksums.
5. **Phase 21:** cosign/signing, compatibility notes, license file if approved.
6. Announce only what is true — no fake download or star counts.

## Hotfix

1. Branch from the release tag.
2. Minimal fix + tests.
3. Tag `vX.Y.Z` (patch) and re-run Release.
4. Document in Changelog under Security/Fixed.

## Operator upgrade notes

- Run database migrations (`migrate` service / Helm hook / `make db-migrate-up`) before or as part of rolling the API.
- Re-read [backup.md](backup.md) before production upgrades.
- Re-encrypt / rotate secrets only with a deliberate plan (TOTP / notification secret keys).

## Related

- [ci.md](ci.md)
- [ROADMAP.md](../../ROADMAP.md)
- [CHANGELOG.md](../../CHANGELOG.md)
- [SECURITY.md](../../SECURITY.md)
