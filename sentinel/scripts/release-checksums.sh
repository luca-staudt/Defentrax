#!/usr/bin/env bash
# release-checksums.sh — produce SHA-256 checksums (and optional cosign notes) for release artifacts.
#
# Usage:
#   ./sentinel/scripts/release-checksums.sh <artifact-dir> [output-file]
#
# Example after downloading GitHub Actions Release artifacts:
#   mkdir -p /tmp/sentinel-release && cd /tmp/sentinel-release
#   # download sentinel-api image tarball + SBOM JSON files into this dir
#   /path/to/repo/sentinel/scripts/release-checksums.sh . SHA256SUMS
#
# This script does NOT invent signatures. Cosign is optional and documented below.
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "usage: $0 <artifact-dir> [output-file]" >&2
  exit 2
fi

DIR="$(cd "$1" && pwd)"
OUT="${2:-$DIR/SHA256SUMS}"

if [[ ! -d "$DIR" ]]; then
  echo "not a directory: $DIR" >&2
  exit 1
fi

shopt -s nullglob
files=()
for f in "$DIR"/*; do
  base="$(basename "$f")"
  case "$base" in
    SHA256SUMS|SHA256SUMS.sig|*.sig|*.pem|*.crt) continue ;;
  esac
  if [[ -f "$f" ]]; then
    files+=("$f")
  fi
done

if [[ ${#files[@]} -eq 0 ]]; then
  echo "no files to checksum in $DIR" >&2
  exit 1
fi

# Stable order
mapfile -t sorted < <(printf '%s\n' "${files[@]}" | sort)

{
  echo "# Defentrax release checksums (SHA-256)"
  echo "# Generated: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "#"
  for f in "${sorted[@]}"; do
    # Portable: sha256sum on Linux; shasum on macOS
    if command -v sha256sum >/dev/null 2>&1; then
      (cd "$DIR" && sha256sum "$(basename "$f")")
    else
      (cd "$DIR" && shasum -a 256 "$(basename "$f")")
    fi
  done
} > "$OUT"

echo "Wrote $OUT"
echo
echo "Verify later with:"
echo "  cd $DIR && sha256sum -c SHA256SUMS"
echo
if command -v cosign >/dev/null 2>&1; then
  echo "Optional (cosign available on PATH — NOT wired into CI yet):"
  echo "  cosign sign-blob --bundle SHA256SUMS.cosign.bundle SHA256SUMS"
  echo "  cosign verify-blob --bundle SHA256SUMS.cosign.bundle SHA256SUMS"
else
  echo "Optional cosign: not installed. Checksums alone are the supported Phase-21 process;"
  echo "image/blob signing remains a maintainer follow-up (see sentinel/docs/release.md)."
fi
