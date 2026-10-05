// Package version holds the canonical SemVer for Sentinel binaries and APIs.
// Keep VERSION in sync with the repository-root VERSION file (enforced by
// scripts/release-check.sh).
package version

import (
	_ "embed"
	"strings"
)

//go:embed VERSION
var embedded string

// buildVersion may be set at link time:
//
//	-ldflags="-X github.com/luca-staudt/Sentinel/sentinel/pkg/version.buildVersion=1.2.3"
var buildVersion string

// String returns the product version (SemVer without a leading "v").
func String() string {
	if v := strings.TrimSpace(buildVersion); v != "" {
		return strings.TrimPrefix(v, "v")
	}
	return strings.TrimSpace(embedded)
}

// Tag returns the Git-style tag form (leading "v"), e.g. "v0.1.0".
func Tag() string {
	v := String()
	if strings.HasPrefix(v, "v") {
		return v
	}
	return "v" + v
}
