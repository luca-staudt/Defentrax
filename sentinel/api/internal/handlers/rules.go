package handlers

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// RulesHandler serves detection rule list/get/enable endpoints.
type RulesHandler struct {
	Pool         *pgxpool.Pool
	OnRuleChange func() // optional hook to reload engine enable flags
}

type ruleResponse struct {
	ID          uuid.UUID       `json:"id"`
	RuleID      string          `json:"rule_id"`
	Name        string          `json:"name"`
	Description string          `json:"description"`
	Enabled     bool            `json:"enabled"`
	Severity    string          `json:"severity"`
	Version     int             `json:"version"`
	Definition  json.RawMessage `json:"definition"`
	CreatedAt   string          `json:"created_at"`
	UpdatedAt   string          `json:"updated_at"`
}

func (h *RulesHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := store.ListRules(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]ruleResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toRuleResponse(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"rules": out})
}

func (h *RulesHandler) Get(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	row, err := store.GetRuleByID(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "rule not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toRuleResponse(row))
}

type patchRuleRequest struct {
	Enabled *bool `json:"enabled"`
}

func (h *RulesHandler) Patch(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	var req patchRuleRequest
	if err := decodeJSON(r, &req); err != nil || req.Enabled == nil {
		badRequest(w, r, "invalid_input", "enabled field required")
		return
	}
	row, err := store.SetRuleEnabled(r.Context(), h.Pool, id, *req.Enabled)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "rule not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	if h.OnRuleChange != nil {
		h.OnRuleChange()
	}
	writeJSON(w, http.StatusOK, toRuleResponse(row))
}

func toRuleResponse(row store.RuleRow) ruleResponse {
	return ruleResponse{
		ID:          row.ID,
		RuleID:      row.YAMLID,
		Name:        row.Name,
		Description: row.Description,
		Enabled:     row.Enabled,
		Severity:    row.Severity,
		Version:     row.Version,
		Definition:  row.Definition,
		CreatedAt:   row.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:   row.UpdatedAt.UTC().Format(timeRFC3339),
	}
}
