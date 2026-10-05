package handlers

import (
	"net/http"

	"github.com/luca-staudt/Sentinel/sentinel/pkg/version"
)

// Version handles GET /api/v1 — minimal version metadata for the API mount.
func Version(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"service": "sentinel-api",
		"version": version.String(),
		"api":     "v1",
	})
}
