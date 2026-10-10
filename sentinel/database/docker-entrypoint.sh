#!/bin/sh
# Wait for Postgres, then run goose migrate once (avoids retrying real SQL failures).
# On failure, inspect logs: docker compose logs migrate
set -eu

cmd="${1:-up}"
shift || true

attempts=0
max_attempts=30
delay_sec=2
last_err=""

echo "migrate: waiting for database..." >&2
while [ "$attempts" -lt "$max_attempts" ]; do
  # Capture status stderr so operators see auth/SQL errors after the wait loop.
  if last_err="$(/usr/local/bin/migrate status 2>&1)"; then
    echo "migrate: database ready" >&2
    echo "migrate: running '${cmd}'..." >&2
    exec /usr/local/bin/migrate "$cmd" "$@"
  fi
  attempts=$((attempts + 1))
  echo "migrate: database not ready (${attempts}/${max_attempts}); sleep ${delay_sec}s" >&2
  sleep "$delay_sec"
done

echo "migrate: database unreachable after ${max_attempts} attempts" >&2
echo "migrate: last error: ${last_err}" >&2
echo "migrate: common causes:" >&2
echo "  - Postgres still starting (check: docker compose ps postgres)" >&2
echo "  - POSTGRES_PASSWORD in .env does not match an existing volume (sentinel-postgres-data)" >&2
echo "  - DATABASE_URL user/db mismatch vs POSTGRES_USER / POSTGRES_DB" >&2
echo "migrate: inspect full logs with: docker compose logs migrate" >&2
exit 1
