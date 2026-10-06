package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/detectionrun"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
	"github.com/luca-staudt/Defentrax/sentinel/detection"
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
	Custom      bool            `json:"custom"`
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

type createRuleRequest struct {
	Name              string            `json:"name"`
	Description       string            `json:"description"`
	Severity          string            `json:"severity"`
	Source            string            `json:"source"`
	Category          string            `json:"category"`
	EventType         string            `json:"event_type"`
	MessageContains   string            `json:"message_contains"`
	Fields            map[string]string `json:"fields"`
	ThresholdCount    int               `json:"threshold_count"`
	WindowSeconds     int               `json:"window_seconds"`
	GroupBy           []string          `json:"group_by"`
	ActionTitle       string            `json:"action_title"`
	ActionDescription string            `json:"action_description"`
}

func (h *RulesHandler) Create(w http.ResponseWriter, r *http.Request) {
	if h.Pool == nil {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "database_unavailable", "database is not configured", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req createRuleRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_input", "invalid JSON body")
		return
	}
	rule := detection.Rule{
		Name:        req.Name,
		Description: req.Description,
		Severity:    req.Severity,
		Condition: detection.Condition{
			Source:          req.Source,
			Category:        req.Category,
			EventType:       req.EventType,
			MessageContains: req.MessageContains,
			Fields:          compactFields(req.Fields),
		},
		GroupBy: compactGroup(req.GroupBy),
		Action: detection.Action{
			Title:       req.ActionTitle,
			Description: req.ActionDescription,
		},
	}
	if req.ThresholdCount > 0 || req.WindowSeconds > 0 {
		rule.Threshold = &detection.Threshold{Count: req.ThresholdCount, WindowSeconds: req.WindowSeconds}
	}
	normalized, err := detectionrun.NormalizeCustomRule(rule)
	if err != nil {
		badRequest(w, r, "invalid_input", err.Error())
		return
	}
	normalized.ID, err = h.uniqueCustomID(r, normalized.ID)
	if err != nil {
		internalError(w, r)
		return
	}
	def, err := detectionrun.CustomRuleDefinition(normalized)
	if err != nil {
		internalError(w, r)
		return
	}
	row, err := store.InsertCustomRule(r.Context(), h.Pool, store.RuleUpsert{
		YAMLID:      normalized.ID,
		Name:        normalized.Name,
		Description: normalized.Description,
		Severity:    normalized.Severity,
		Version:     normalized.Version,
		Definition:  def,
	})
	if err != nil {
		if errors.Is(err, store.ErrRuleExists) {
			apperrors.WriteJSON(w, http.StatusConflict, "conflict", "a rule with this name already exists", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	if h.OnRuleChange != nil {
		h.OnRuleChange()
	}
	writeJSON(w, http.StatusCreated, toRuleResponse(row))
}

func (h *RulesHandler) uniqueCustomID(r *http.Request, base string) (string, error) {
	id := base
	for i := 2; i < 50; i++ {
		exists, err := store.YAMLRuleIDExists(r.Context(), h.Pool, id)
		if err != nil {
			return "", err
		}
		if !exists {
			return id, nil
		}
		id = base + "-" + itoa(i)
	}
	return "", errors.New("could not allocate rule id")
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	var b [16]byte
	i := len(b)
	for n > 0 {
		i--
		b[i] = byte('0' + n%10)
		n /= 10
	}
	return string(b[i:])
}

func compactFields(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string)
	for k, v := range in {
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if k != "" && v != "" {
			out[k] = v
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}

func compactGroup(in []string) []string {
	var out []string
	for _, item := range in {
		item = strings.TrimSpace(item)
		if item != "" {
			out = append(out, item)
		}
	}
	return out
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
		Custom:      definitionOrigin(row.Definition) == "custom",
		CreatedAt:   row.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:   row.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func definitionOrigin(def json.RawMessage) string {
	var m map[string]any
	if err := json.Unmarshal(def, &m); err != nil {
		return ""
	}
	origin, _ := m["origin"].(string)
	return origin
}
