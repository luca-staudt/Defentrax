package handlers

import (
	"net/http"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

// DashboardHandler serves aggregated operator metrics.
type DashboardHandler struct {
	Pool *pgxpool.Pool
}

func (h *DashboardHandler) Stats(w http.ResponseWriter, r *http.Request) {
	stats, err := store.DashboardStatsQuery(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, stats)
}
