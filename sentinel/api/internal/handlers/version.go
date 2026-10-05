package handlers

import (
	"net/http"
)

const apiVersion = "0.1.0"

// Version handles GET /api/v1 — minimal version metadata for the API mount.
func Version(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{
		"service": "sentinel-api",
		"version": apiVersion,
		"api":     "v1",
	})
}
