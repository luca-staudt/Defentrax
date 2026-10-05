# Scripts

Development and CI helper scripts. Repository-wide build/test/lint entry points live in the root `Makefile`.

## Test runners

| Script | Purpose |
|--------|---------|
| `./sentinel/scripts/run-unit-tests.sh` | Default suite: `make test` + `make openapi-validate` (no Postgres) |
| `./sentinel/scripts/run-integration-tests.sh` | Migration smoke + `make api-test-integration` |
| `./sentinel/scripts/test-migrations.sh` | Goose up/down/status cycle |

Environment:

- `TEST_DATABASE_URL` — integration tests and migration script (falls back to local `sentinel_migration_test` DB)
- `REQUIRE_INTEGRATION_DB=1` — fail instead of silently skipping when Postgres is required

## Release helpers

| Script | Purpose |
|--------|---------|
| `./sentinel/scripts/release-check.sh` | Version consistency + release file checklist (`make release-check`) |
| `./sentinel/scripts/release-checksums.sh` | SHA-256 `SHA256SUMS` for an artifact directory |
| `./sentinel/scripts/release-sbom-local.sh` | Local Syft source SPDX (mirrors CI) |

See `sentinel/docs/release.md` for the full tag → SBOM → checksum → GitHub Release flow.

## Makefile shortcuts

```bash
make fmt-check          # gofmt gate (CI Formatting)
make build              # api + agent (stamps VERSION)
make test               # unit tests (all modules + pkg + version)
make test-all           # unit + integration
make test-ci            # unit + OpenAPI validate + release-check
make release-check      # version / docs release gate
make release-sbom-local # Syft source SBOM into ./dist/sbom
make api-test-integration
make frontend-lint      # ESLint (after npm ci)
make frontend-build     # Next.js production build
```

See `sentinel/docs/testing.md` for the security-focused test matrix and `sentinel/docs/ci.md` for GitHub Actions.
