package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

const maxSilence = 14 * 24 * time.Hour

type silenceRequest struct {
	Until string `json:"until"`
}

func readSilenceUntil(r *http.Request) (time.Time, bool) {
	var req silenceRequest
	if err := decodeJSON(r, &req); err != nil || req.Until == "" {
		return time.Time{}, false
	}
	until, err := time.Parse(time.RFC3339, req.Until)
	if err != nil {
		return time.Time{}, false
	}
	now := time.Now().UTC()
	until = until.UTC()
	if !until.After(now.Add(time.Minute)) || until.After(now.Add(maxSilence)) {
		return time.Time{}, false
	}
	return until, true
}

func actorID(r *http.Request) *uuid.UUID {
	p, ok := principal.FromContext(r.Context())
	if !ok || p == nil {
		return nil
	}
	return &p.UserID
}

func writeSilence(w http.ResponseWriter, pool *pgxpool.Pool, r *http.Request, kind string, id uuid.UUID, exists func() error) {
	if err := exists(); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", kind+" not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	until, ok := readSilenceUntil(r)
	if !ok {
		badRequest(w, r, "invalid_input", "until must be an RFC3339 time between 1 minute and 14 days from now")
		return
	}
	if err := store.UpsertSilence(r.Context(), pool, kind, id, until, actorID(r)); err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"target_kind": kind,
		"target_id":   id,
		"until":       until.Format(timeRFC3339),
	})
}

func clearSilence(w http.ResponseWriter, pool *pgxpool.Pool, r *http.Request, kind string, id uuid.UUID) {
	if err := store.DeleteSilence(r.Context(), pool, kind, id); err != nil {
		internalError(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func formatSilence(until *time.Time) *string {
	if until == nil || !until.After(time.Now()) {
		return nil
	}
	s := until.UTC().Format(timeRFC3339)
	return &s
}

func formatOptionalTime(t *time.Time) *string {
	if t == nil || t.IsZero() {
		return nil
	}
	s := t.UTC().Format(timeRFC3339)
	return &s
}
