#!/usr/bin/env bash
# Run the default CI-safe unit suite (no PostgreSQL required).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "${ROOT}"

echo "==> Sentinel unit tests (make test)"
make test

echo "==> OpenAPI validation (when tooling available)"
make openapi-validate

echo "Unit suite OK"
