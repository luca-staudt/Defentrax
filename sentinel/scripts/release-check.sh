#!/usr/bin/env bash
# release-check.sh — validate version wiring and release preconditions.
# Exit 0 only when the repo is consistent for a tagged release *of the VERSION file*.
# Does NOT claim v1.0 readiness; see docs/v1-readiness.md (project store) and
# sentinel/docs/release.md for the honest readiness verdict.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT"

fail=0
warn=0

red() { printf 'FAIL: %s\n' "$*" >&2; fail=$((fail + 1)); }
yellow() { printf 'WARN: %s\n' "$*" >&2; warn=$((warn + 1)); }
ok() { printf 'OK:   %s\n' "$*"; }

need_file() {
  if [[ ! -f "$1" ]]; then
    red "missing required file: $1"
  else
    ok "present $1"
  fi
}

if [[ ! -f VERSION ]]; then
  red "root VERSION file missing"
  exit 1
fi

VERSION="$(tr -d '[:space:]' < VERSION)"
if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+([.-][0-9A-Za-z.-]+)?$ ]]; then
  red "VERSION='$VERSION' is not SemVer-like"
else
  ok "VERSION=$VERSION"
fi

PKG_VER="$(tr -d '[:space:]' < sentinel/pkg/version/VERSION 2>/dev/null || true)"
if [[ "$PKG_VER" != "$VERSION" ]]; then
  red "sentinel/pkg/version/VERSION='$PKG_VER' != root VERSION='$VERSION'"
else
  ok "pkg/version/VERSION matches"
fi

FE_VER=""
if command -v python3 >/dev/null 2>&1; then
  FE_VER="$(python3 -c 'import json; print(json.load(open("sentinel/frontend/package.json"))["version"])')"
elif command -v node >/dev/null 2>&1; then
  FE_VER="$(node -p "require('./sentinel/frontend/package.json').version")"
fi
if [[ -z "$FE_VER" ]]; then
  yellow "could not read frontend package.json version (install python3 or node)"
elif [[ "$FE_VER" != "$VERSION" ]]; then
  red "frontend package.json version='$FE_VER' != VERSION='$VERSION'"
else
  ok "frontend package.json version matches"
fi

CHART_VER="$(awk '/^version:/{print $2; exit}' sentinel/deployments/helm/sentinel/Chart.yaml)"
APP_VER="$(awk '/^appVersion:/{gsub(/"/,""); print $2; exit}' sentinel/deployments/helm/sentinel/Chart.yaml)"
if [[ "$CHART_VER" != "$VERSION" ]]; then
  red "Helm Chart.yaml version='$CHART_VER' != VERSION='$VERSION'"
else
  ok "Helm chart version matches"
fi
if [[ "$APP_VER" != "$VERSION" ]]; then
  red "Helm Chart.yaml appVersion='$APP_VER' != VERSION='$VERSION'"
else
  ok "Helm appVersion matches"
fi

IMG_TAG="$(awk '/^[[:space:]]*tag:/{gsub(/"/,""); print $2; exit}' sentinel/deployments/helm/sentinel/values.yaml)"
if [[ "$IMG_TAG" != "$VERSION" ]]; then
  red "Helm values.yaml images.tag='$IMG_TAG' != VERSION='$VERSION'"
else
  ok "Helm default image tag matches"
fi

OAPI_VER="$(awk '/^[[:space:]]*version:/{print $2; exit}' sentinel/api/openapi/openapi.yaml)"
if [[ "$OAPI_VER" != "$VERSION" ]]; then
  red "OpenAPI info.version='$OAPI_VER' != VERSION='$VERSION'"
else
  ok "OpenAPI info.version matches"
fi

# Docs / release artifacts expected for a tagged release
need_file CHANGELOG.md
need_file SECURITY.md
need_file CONTRIBUTING.md
need_file ROADMAP.md
need_file sentinel/docs/release.md
need_file sentinel/docs/compatibility.md
need_file sentinel/docs/ci.md
need_file .github/workflows/release.yml
need_file .github/workflows/reusable-sbom.yml

if [[ ! -f LICENSE ]]; then
  yellow "no LICENSE file — blocks honest public OSS v1.0; maintainer decision required (do not invent)"
else
  ok "LICENSE present"
fi

if grep -qE '^## \[Unreleased\]' CHANGELOG.md; then
  ok "CHANGELOG has Unreleased section"
else
  yellow "CHANGELOG missing ## [Unreleased] section"
fi

if grep -qE "^## \[${VERSION}\]" CHANGELOG.md; then
  ok "CHANGELOG has ## [$VERSION] section"
else
  yellow "CHANGELOG has no ## [$VERSION] section yet (add before tagging)"
fi

# Honesty gate: never treat 1.0.0 as ready solely because VERSION was bumped
if [[ "$VERSION" == "1.0.0" ]]; then
  yellow "VERSION is 1.0.0 — confirm every item in the v1.0 readiness report is truly green before tagging"
fi

# Merge / main reality check (informational)
if git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
  ok "git branch=$BRANCH"
  if [[ "$BRANCH" != "main" ]]; then
    yellow "not on main — first public tag should be cut from an integration branch merged to main"
  fi
fi

echo
if [[ "$fail" -gt 0 ]]; then
  echo "release-check: FAILED ($fail error(s), $warn warning(s))" >&2
  exit 1
fi
echo "release-check: PASSED with $warn warning(s)"
echo "Recommended first tag for this tree: v${VERSION} (see sentinel/docs/release.md)"
exit 0
