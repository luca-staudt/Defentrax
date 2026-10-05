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

## Makefile shortcuts

```bash
make build              # api + agent
make test               # unit tests (all modules + pkg)
make test-all           # unit + integration
make test-ci            # unit + OpenAPI validate (CI-friendly)
make api-test-integration
```

See `sentinel/docs/testing.md` for the security-focused test matrix.
