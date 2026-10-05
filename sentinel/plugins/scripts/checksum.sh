#!/usr/bin/env bash
# Recompute checksum_sha256 for a plugin directory's artifacts (from plugin.json).
# Usage: ./checksum.sh path/to/plugin-dir
set -euo pipefail
dir="${1:?plugin directory required}"
manifest="$dir/plugin.json"
test -f "$manifest" || { echo "missing $manifest" >&2; exit 1; }
python3 - "$dir" "$manifest" <<'PY'
import hashlib, json, sys, os
dir_path, manifest = sys.argv[1], sys.argv[2]
with open(manifest) as f:
    m = json.load(f)
arts = m.get("artifacts") or []
h = hashlib.sha256()
for a in sorted(arts):
    path = os.path.join(dir_path, a)
    with open(path, "rb") as fh:
        data = fh.read()
    h.update((a + "\n").encode())
    h.update(data)
    h.update(b"\n")
print(h.hexdigest())
PY
