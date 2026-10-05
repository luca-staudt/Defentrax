#!/bin/sh
# Wait for Postgres, then run goose migrate once (avoids retrying real SQL failures).
set -eu

cmd="${1:-up}"
shift || true

attempts=0
max_attempts=30
delay_sec=2

echo "migrate: waiting for database..." >&2
while [ "$attempts" -lt "$max_attempts" ]; do
  if /usr/local/bin/migrate status >/dev/null 2>&1; then
    echo "migrate: database ready" >&2
    exec /usr/local/bin/migrate "$cmd" "$@"
  fi
  attempts=$((attempts + 1))
  echo "migrate: database not ready (${attempts}/${max_attempts}); sleep ${delay_sec}s" >&2
  sleep "$delay_sec"
done

echo "migrate: database unreachable after ${max_attempts} attempts" >&2
exit 1
