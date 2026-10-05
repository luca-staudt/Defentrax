package handlers

import (
	"context"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
)

// Readiness performs dependency checks for GET /readyz.
type Readiness struct {
	RequireDatabase bool
	Pool            *pgxpool.Pool
}

// Ready handles GET /readyz — readiness probe with optional database check.
func (r Readiness) Ready(w http.ResponseWriter, _ *http.Request) {
	checks := map[string]string{}

	if !r.RequireDatabase {
		checks["database"] = "not_configured"
		writeJSON(w, http.StatusOK, map[string]any{
			"status": "ready",
			"checks": checks,
		})
		return
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := db.Ping(ctx, r.Pool); err != nil {
		checks["database"] = "unreachable"
		writeJSON(w, http.StatusServiceUnavailable, map[string]any{
			"status": "not_ready",
			"checks": checks,
		})
		return
	}

	checks["database"] = "ok"
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ready",
		"checks": checks,
	})
}
