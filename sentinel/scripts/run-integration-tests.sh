#!/usr/bin/env bash
# PostgreSQL-backed integration tests (build tag: integration).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
export TEST_DATABASE_URL="${TEST_DATABASE_URL:-${DATABASE_URL:-postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable}}"

require="${REQUIRE_INTEGRATION_DB:-0}"
if ! command -v psql >/dev/null 2>&1; then
  if [[ "${require}" == "1" ]]; then
    echo "REQUIRE_INTEGRATION_DB=1 but psql not found" >&2
    exit 1
  fi
  echo "psql not found; running integration tests (they will skip if Postgres is unreachable)"
fi

cd "${ROOT}"
echo "Using TEST_DATABASE_URL=${TEST_DATABASE_URL}"

echo "==> Migration smoke (optional)"
if [[ -x "${ROOT}/sentinel/scripts/test-migrations.sh" ]]; then
  DATABASE_URL="${TEST_DATABASE_URL}" "${ROOT}/sentinel/scripts/test-migrations.sh"
fi

echo "==> API integration tests"
make api-test-integration

echo "Integration suite OK"
