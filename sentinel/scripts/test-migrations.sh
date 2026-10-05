#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DATABASE_URL="${DATABASE_URL:-${TEST_DATABASE_URL:-postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable}}"

export DATABASE_URL

echo "Using DATABASE_URL=${DATABASE_URL}"

cd "${ROOT}/database"
go run ./cmd/migrate down 2>/dev/null || true
go run ./cmd/migrate up
go run ./cmd/migrate status
go run ./cmd/migrate down
go run ./cmd/migrate up

echo "Migration up/down cycle OK"
