#!/usr/bin/env bash
# release-sbom-local.sh — generate source SBOM locally (mirrors CI Syft step).
# Requires: syft OR docker. Optional: trivy for an image SBOM after a local API image build.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

OUT_DIR="${1:-./dist/sbom}"
mkdir -p "$OUT_DIR"

VERSION="$(tr -d '[:space:]' < VERSION)"
SRC_OUT="$OUT_DIR/sentinel-source-sbom-${VERSION}.spdx.json"

echo "==> Source SBOM (Syft / SPDX) → $SRC_OUT"
if command -v syft >/dev/null 2>&1; then
  syft dir:"$ROOT" -o spdx-json="$SRC_OUT"
elif command -v docker >/dev/null 2>&1; then
  docker run --rm -v "$ROOT:/src" -w /src anchore/syft:v1.18.1 \
    dir:/src -o spdx-json=/src/"${OUT_DIR#./}"/sentinel-source-sbom-${VERSION}.spdx.json
else
  echo "need syft or docker to generate a source SBOM" >&2
  exit 1
fi

echo
echo "Optional API image SBOM (after: docker build -t sentinel-api:${VERSION} -f sentinel/api/Dockerfile .):"
echo "  trivy image --format spdx-json --output $OUT_DIR/sentinel-api-image-sbom-${VERSION}.spdx.json sentinel-api:${VERSION}"
echo
echo "Then checksum artifacts:"
echo "  ./sentinel/scripts/release-checksums.sh $OUT_DIR"
echo
echo "CI equivalent: GitHub Actions workflow 'Release' → reusable-sbom.yml"
echo "  (Syft source SPDX + Trivy API image SPDX artifacts)."
