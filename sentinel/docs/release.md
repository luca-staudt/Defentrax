# Release process

How to cut a **tagged** Sentinel release with SBOM, checksums, and notes.
Current product line: **`0.1.0`** (see root [`VERSION`](../../VERSION)).

> **Verdict:** prepare **`v0.1.0`** as the first formal tag. Do **not** tag
> **`v1.0.0`** until the readiness report is honestly green (license, PR merge to
> `main`, collector coverage, residual security items). Details:
> project store `docs/v1-readiness.md`.

## Versions (single bump)

| Location | Field |
|----------|--------|
| `VERSION` | Canonical SemVer (no `v`) |
| `sentinel/pkg/version/VERSION` | Embedded in API / agent |
| `sentinel/frontend/package.json` | `version` |
| `sentinel/api/openapi/openapi.yaml` | `info.version` |
| Helm `Chart.yaml` | `version` + `appVersion` |
| Helm `values.yaml` | default image `tag` |
| Compose | `SENTINEL_IMAGE_TAG` default |

```bash
# After editing VERSION (+ mirrored pkg/version/VERSION and the table above):
./sentinel/scripts/release-check.sh
make release-check
```

Optional link-time override for binaries:

```text
-X github.com/luca-staudt/Sentinel/sentinel/pkg/version.buildVersion=0.1.0
```

## Preconditions

1. Integration branch merged (or about to merge) to `main`; **Main** CI green ([ci.md](ci.md)).
2. `./sentinel/scripts/release-check.sh` passes (warnings reviewed).
3. Security scans reviewed (gitleaks, gosec, Trivy, Dependabot backlog).
4. `make openapi-validate` / OpenAPI coverage green.
5. Docs match behavior ([compatibility.md](compatibility.md)).
6. **`LICENSE`:** do not market a public OSS `v1.0.0` without a license file.
   A private/maintainer `v0.1.0` tag may still run the Release workflow for artifacts.

## Tag and workflow

```bash
git checkout main
git pull
./sentinel/scripts/release-check.sh
git tag -a "v$(tr -d '[:space:]' < VERSION)" -m "v$(tr -d '[:space:]' < VERSION)"
git push origin "v$(tr -d '[:space:]' < VERSION)"
```

Or: Actions → **Release** → `workflow_dispatch` with tag label (e.g. `v0.1.0`).

Workflow: [`.github/workflows/release.yml`](../../.github/workflows/release.yml)
runs full tests, security jobs, image builds (no registry push), and SBOM upload.

## SBOM — exact commands

### Via CI (preferred)

1. Open the **Release** workflow run for the tag.
2. Download artifacts:
   - `sentinel-source-sbom.spdx.json` (Syft)
   - `sentinel-api-image-sbom` / `sentinel-api-image-sbom.spdx.json` (Trivy)
   - optional exported `sentinel-api` image tarball (when `export-api-image` is enabled)

### Local (mirrors CI)

```bash
# Source SPDX via Syft (or Dockerized Syft):
./sentinel/scripts/release-sbom-local.sh ./dist/sbom

# Optional image SPDX after building the API image:
docker build -t "sentinel-api:$(tr -d '[:space:]' < VERSION)" -f sentinel/api/Dockerfile .
trivy image --format spdx-json \
  --output "./dist/sbom/sentinel-api-image-sbom-$(tr -d '[:space:]' < VERSION).spdx.json" \
  "sentinel-api:$(tr -d '[:space:]' < VERSION)"
```

## Checksums — exact commands

```bash
# Put release files (SBOMs, image tarball, binaries) in one directory, then:
./sentinel/scripts/release-checksums.sh ./dist/sbom SHA256SUMS

# Verify:
cd ./dist/sbom && sha256sum -c SHA256SUMS
```

Attach `SHA256SUMS` (and SBOMs) to the GitHub Release.

### Cosign (optional, not in CI yet)

Cosign image/blob signing is **documented but not automated**. Large maintainer
follow-up for a signed `v1.0` line. If `cosign` is installed:

```bash
cosign sign-blob --bundle SHA256SUMS.cosign.bundle SHA256SUMS
cosign verify-blob --bundle SHA256SUMS.cosign.bundle SHA256SUMS
```

## Maintainer checklist (post-workflow)

1. `./sentinel/scripts/release-check.sh` was green on the tagged commit.
2. Download SBOM / API image artifacts from the workflow run.
3. Generate `SHA256SUMS` with `release-checksums.sh`.
4. Push immutable image tags to **your** registry (not automated in-tree).
5. Align Compose `SENTINEL_IMAGE_TAG` and Helm `appVersion` / image tags (already
   expected to match `VERSION` before tag).
6. Publish GitHub Release notes from [`CHANGELOG.md`](../../CHANGELOG.md); attach
   checksums + SBOMs.
7. Confirm LICENSE decision before **public** distribution / `v1.0.0` marketing.

## Hotfix

1. Branch from the release tag.
2. Minimal fix + tests.
3. Bump patch in `VERSION` (+ mirrors); run `release-check.sh`.
4. Tag `vX.Y.Z` and re-run Release.
5. Document under Changelog Security/Fixed.

## Operator upgrade notes

- Run database migrations before or with the API roll (`migrate` service / Helm hook / `make db-migrate-up`).
- Re-read [backup.md](backup.md) before production upgrades.
- Rotate secrets only with a deliberate plan (session / TOTP / notification keys).

## Related

- [compatibility.md](compatibility.md)
- [ci.md](ci.md)
- [ROADMAP.md](../../ROADMAP.md)
- [CHANGELOG.md](../../CHANGELOG.md)
- [SECURITY.md](../../SECURITY.md)
