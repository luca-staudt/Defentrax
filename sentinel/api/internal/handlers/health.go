package handlers

import (
	"encoding/json"
	"net/http"
)

// Health handles GET /healthz — liveness probe (process is running).
func Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// Ready handles GET /readyz — readiness probe.
// Phase 2: always ready; Phase 3 will check database (and later Redis) connectivity.
func Ready(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ready",
		"checks": map[string]string{
			"database": "stub_always_ready",
		},
	})
}

func writeJSON(w http.ResponseWriter, status int, body any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(body)
}
