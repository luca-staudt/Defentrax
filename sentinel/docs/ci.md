# CI/CD (GitHub Actions)

Phase 18 wires GitHub Actions to the existing Makefile / scripts. Workflows live under [`.github/workflows/`](../../.github/workflows/). **No repository secrets are required** for these workflows (images are built and loaded locally in the runner — not pushed to a registry).

## Workflows

| Workflow | File | Trigger | Purpose |
|----------|------|---------|---------|
| **Pull Request** | `pull-request.yml` | PRs → `main` | Format, lint, unit, integration, security, build, API container |
| **Main** | `main.yml` | Push → `main` | Full PR-equivalent + all Docker images + SBOM |
| **Release** | `release.yml` | Tag `v*` or `workflow_dispatch` | Full tests, images (API artifact export), SBOM, checklist summary |
| Reusable — Security | `reusable-security.yml` | `workflow_call` | govulncheck, gosec, Trivy filesystem |
| Reusable — Docker | `reusable-docker.yml` | `workflow_call` | Multi-image build (no push); optional Trivy image scan |
| Reusable — SBOM | `reusable-sbom.yml` | `workflow_call` | Syft source SPDX + optional Trivy image SPDX |

### Pull Request jobs

| Job | What it runs | Local equivalent |
|-----|--------------|------------------|
| Formatting | `gofmt -l` over `sentinel/**/*.go` | `make fmt-check` |
| Linting | `golangci-lint` (API), `npm run lint` (frontend), OpenAPI | `make lint` · `make frontend-lint` · `make openapi-validate` |
| Unit tests | Go unit suite | `make test` |
| Integration tests | Postgres **service container** + migration smoke + API integration | `./sentinel/scripts/run-integration-tests.sh` (with `REQUIRE_INTEGRATION_DB=1`) |
| Security scan | govulncheck, gosec, Trivy fs (`vuln,misconfig,secret`) | Install tools locally; no single Make target yet |
| Build | `make build` + Next.js `next build` | `make build` · `make frontend-build` (after `npm ci`) |
| Container build | `sentinel/api/Dockerfile` (load + Trivy image) | `docker build -f sentinel/api/Dockerfile -t sentinel-api:local .` |

Frontend formatting is covered by ESLint (`npm run lint`); there is no separate Prettier gate yet.

### Integration Postgres

Service container: `postgres:16.6-alpine` with user/db `sentinel_test` / `sentinel_migration_test` (password `sentinel_test`, CI-only). Matches the default DSN in `sentinel/docs/testing.md`.

### Security — what is and is not configured

**Configured in CI**

- `govulncheck` on Go modules under `sentinel/`
- `gosec -severity=high` on `api`, `agent`, `database`, `detection`, `plugins` (MEDIUM/LOW deferred to Phase 19)
- Trivy filesystem scan (CRITICAL/HIGH, unfixed ignored)
- Trivy image scan on built `sentinel-api` (PR/main/release container jobs)

**Not configured here** (do not assume they run)

- GitHub Code Scanning / CodeQL SARIF upload
- Dependabot (enable separately in repo settings if desired)
- Registry push / cosign / image signing (Phase 21 release prep)
- Secret scanning beyond Trivy’s `secret` scanner on the checkout

## Release workflow

1. Ensure `main` is green (Main workflow).
2. Create an annotated SemVer tag, e.g. `git tag -a v0.1.0 -m "v0.1.0" && git push origin v0.1.0`  
   Or run **Release** via Actions → `workflow_dispatch` with a tag label.
3. Wait for **Release** workflow: full tests, security, Docker builds, SBOM artifacts.
4. Download artifacts (source SBOM, API image SBOM, optional `sentinel-api` tarball).
5. Push immutable tags to **your** registry (manual / future CD — not in these workflows).
6. Align Helm/Compose image tags; draft GitHub Release notes + checksums (Phase 21).
7. Do not distribute publicly until a LICENSE decision is recorded.

## Branch protection (recommended)

On `main`, require status checks (names match job `name:` fields):

- Formatting  
- Linting  
- Unit tests  
- Integration tests  
- Security scans (from the reusable workflow job)  
- Build  
- Container build  

Exact check names in the GitHub UI may include the workflow name prefix (e.g. `Pull Request / Formatting`). After the first PR run, select the checks that appear under **Settings → Branches → Rule → Require status checks**.

## Make target map (quick)

```bash
make fmt-check              # Formatting
make lint                   # API golangci-lint
make frontend-lint          # ESLint (needs node_modules)
make test                   # Unit tests
make api-test-integration   # Integration (needs Postgres)
make test-all               # Unit + integration
make test-ci                # Unit + OpenAPI
make openapi-validate
make build                  # API + agent binaries
make frontend-build         # Next.js production build
./sentinel/scripts/run-unit-tests.sh
./sentinel/scripts/run-integration-tests.sh
```

See also [testing.md](testing.md).
