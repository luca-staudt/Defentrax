package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/ai"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// AIHandler serves optional AI analysis settings and analyze endpoints.
type AIHandler struct {
	Pool       *pgxpool.Pool
	SecretsKey []byte
	Limiter    ratelimit.Limiter
}

type aiSettingsResponse struct {
	Enabled   bool   `json:"enabled"`
	Provider  string `json:"provider"`
	BaseURL   string `json:"base_url"`
	Model     string `json:"model"`
	HasAPIKey bool   `json:"has_api_key"`
	UpdatedAt string `json:"updated_at,omitempty"`
}

type putAISettingsRequest struct {
	Enabled  *bool   `json:"enabled"`
	Provider *string `json:"provider"`
	BaseURL  *string `json:"base_url"`
	Model    *string `json:"model"`
	APIKey   *string `json:"api_key"`
}

type analyzeRequest struct {
	AlertID *uuid.UUID `json:"alert_id"`
	EventID *uuid.UUID `json:"event_id"`
}

type aiAnalysisResponse struct {
	ID           uuid.UUID       `json:"id"`
	AlertID      *uuid.UUID      `json:"alert_id,omitempty"`
	EventID      *uuid.UUID      `json:"event_id,omitempty"`
	Status       string          `json:"status"`
	Model        string          `json:"model"`
	Assessment   json.RawMessage `json:"assessment"`
	ErrorMessage string          `json:"error_message,omitempty"`
	CreatedBy    *uuid.UUID      `json:"created_by,omitempty"`
	CreatedAt    string          `json:"created_at"`
}

func (h *AIHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	s, err := store.GetAIAnalysisSettings(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toAISettingsResponse(s))
}

func (h *AIHandler) PutSettings(w http.ResponseWriter, r *http.Request) {
	if len(h.SecretsKey) != 32 {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "misconfigured", "SECRETS_ENCRYPTION_KEY required to store AI API keys", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req putAISettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	upd := store.AIAnalysisSettingsUpdate{
		Enabled:   req.Enabled,
		UpdatedBy: actorID(r),
	}
	if req.Provider != nil {
		p := strings.ToLower(strings.TrimSpace(*req.Provider))
		if p != "openai" && p != "openai_compatible" {
			badRequest(w, r, "invalid_provider", "provider must be openai or openai_compatible")
			return
		}
		upd.Provider = &p
	}
	if req.BaseURL != nil {
		u := strings.TrimRight(strings.TrimSpace(*req.BaseURL), "/")
		if u == "" {
			badRequest(w, r, "invalid_base_url", "base_url required")
			return
		}
		if !strings.HasPrefix(u, "https://") && !strings.HasPrefix(u, "http://") {
			badRequest(w, r, "invalid_base_url", "base_url must be http(s)")
			return
		}
		upd.BaseURL = &u
	}
	if req.Model != nil {
		m := strings.TrimSpace(*req.Model)
		if m == "" {
			badRequest(w, r, "invalid_model", "model required")
			return
		}
		upd.Model = &m
	}
	if req.APIKey != nil {
		key := strings.TrimSpace(*req.APIKey)
		if key == "" {
			empty := ""
			has := false
			upd.APIKeyEncrypted = &empty
			upd.HasAPIKey = &has
		} else {
			enc, err := ai.EncryptAPIKey(h.SecretsKey, key)
			if err != nil {
				internalError(w, r)
				return
			}
			has := true
			upd.APIKeyEncrypted = &enc
			upd.HasAPIKey = &has
		}
	}
	s, err := store.UpsertAIAnalysisSettings(r.Context(), h.Pool, upd)
	if err != nil {
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, actorID(r), "user", "ai.settings.update", "ai_settings", &s.ID, map[string]any{
		"enabled": s.Enabled, "provider": s.Provider, "model": s.Model, "has_api_key": s.HasAPIKey,
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusOK, toAISettingsResponse(s))
}

func (h *AIHandler) Analyze(w http.ResponseWriter, r *http.Request) {
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if h.Limiter != nil {
		allowed, err := h.Limiter.Allow(r.Context(), "ai:"+p.UserID.String())
		if err != nil {
			internalError(w, r)
			return
		}
		if !allowed {
			apperrors.WriteJSON(w, http.StatusTooManyRequests, "rate_limited", "AI analysis rate limit exceeded", middleware.RequestIDFromContext(r.Context()))
			return
		}
	}
	// Soft DB rate limit: 20 analyses / hour / user.
	if n, err := store.CountRecentAIAnalyses(r.Context(), h.Pool, p.UserID, time.Now().UTC().Add(-time.Hour)); err == nil && n >= 20 {
		apperrors.WriteJSON(w, http.StatusTooManyRequests, "rate_limited", "AI analysis hourly quota exceeded", middleware.RequestIDFromContext(r.Context()))
		return
	}

	var req analyzeRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if (req.AlertID == nil && req.EventID == nil) || (req.AlertID != nil && req.EventID != nil) {
		badRequest(w, r, "invalid_input", "provide exactly one of alert_id or event_id")
		return
	}

	settings, err := store.GetAIAnalysisSettings(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	if !settings.Enabled {
		badRequest(w, r, "ai_disabled", "AI analysis is disabled")
		return
	}
	if !settings.HasAPIKey || settings.APIKeyEncrypted == "" {
		badRequest(w, r, "ai_misconfigured", "AI provider API key is not configured")
		return
	}
	if len(h.SecretsKey) != 32 {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "misconfigured", "SECRETS_ENCRYPTION_KEY required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	apiKey, err := ai.DecryptAPIKey(h.SecretsKey, settings.APIKeyEncrypted)
	if err != nil {
		internalError(w, r)
		return
	}

	prompt, err := h.buildPrompt(r, req)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "target not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		badRequest(w, r, "invalid_target", err.Error())
		return
	}

	assessment, err := ai.Analyze(r.Context(), ai.Settings{
		BaseURL: settings.BaseURL,
		Model:   settings.Model,
		APIKey:  apiKey,
	}, prompt)
	if err != nil {
		raw, _ := json.Marshal(map[string]string{"error": err.Error()})
		failed, cerr := store.CreateAIAnalysis(r.Context(), h.Pool, store.AIAnalysisCreate{
			AlertID:      req.AlertID,
			EventID:      req.EventID,
			Status:       "failed",
			Model:        settings.Model,
			Assessment:   raw,
			ErrorMessage: truncateStr(err.Error(), 500),
			CreatedBy:    &p.UserID,
		})
		if cerr != nil {
			internalError(w, r)
			return
		}
		_ = store.Audit(r.Context(), h.Pool, &p.UserID, "user", "ai.analyze.failed", "ai_analysis", &failed.ID, map[string]any{
			"model": settings.Model,
		}, parseClientIP(r), r.UserAgent())
		apperrors.WriteJSON(w, http.StatusBadGateway, "provider_error", "AI provider request failed", middleware.RequestIDFromContext(r.Context()))
		return
	}

	raw, _ := json.Marshal(assessment)
	row, err := store.CreateAIAnalysis(r.Context(), h.Pool, store.AIAnalysisCreate{
		AlertID:    req.AlertID,
		EventID:    req.EventID,
		Status:     "completed",
		Model:      settings.Model,
		Assessment: raw,
		CreatedBy:  &p.UserID,
	})
	if err != nil {
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, &p.UserID, "user", "ai.analyze", "ai_analysis", &row.ID, map[string]any{
		"model": settings.Model, "alert_id": req.AlertID, "event_id": req.EventID,
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusOK, toAIAnalysisResponse(row))
}

func (h *AIHandler) GetAnalysis(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	row, err := store.GetAIAnalysis(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "analysis not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toAIAnalysisResponse(row))
}

func (h *AIHandler) ListAnalyses(w http.ResponseWriter, r *http.Request) {
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	var alertID *uuid.UUID
	if sid := strings.TrimSpace(r.URL.Query().Get("alert_id")); sid != "" {
		id, err := uuid.Parse(sid)
		if err != nil {
			badRequest(w, r, "invalid_id", "invalid alert_id")
			return
		}
		alertID = &id
	}
	rows, err := store.ListAIAnalyses(r.Context(), h.Pool, alertID, limit)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]aiAnalysisResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toAIAnalysisResponse(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"analyses": out})
}

func (h *AIHandler) buildPrompt(r *http.Request, req analyzeRequest) (string, error) {
	if req.AlertID != nil {
		alert, err := store.GetAlertByID(r.Context(), h.Pool, *req.AlertID)
		if err != nil {
			return "", err
		}
		return fmt.Sprintf(
			"Analyze this Defentrax alert for possible explanations and defensive next steps.\nTitle: %s\nSeverity: %s\nStatus: %s\nDescription: %s\nSource IP: %v\nEvent count: %d\nFirst seen: %s\nLast seen: %s\n",
			alert.Title, alert.Severity, alert.Status, alert.Description, alert.SourceIP, alert.EventCount,
			alert.FirstSeenAt.UTC().Format(time.RFC3339), alert.LastSeenAt.UTC().Format(time.RFC3339),
		), nil
	}
	ev, err := store.GetEventByID(r.Context(), h.Pool, *req.EventID)
	if err != nil {
		return "", err
	}
	return fmt.Sprintf(
		"Analyze this Defentrax event for possible explanations and defensive next steps.\nSource: %s\nCategory: %s\nSeverity: %s\nHost: %s\nMessage: %s\nOccurred: %s\n",
		ev.Source, ev.Category, ev.Severity, ev.Host, ev.Message, ev.OccurredAt.UTC().Format(time.RFC3339),
	), nil
}

func toAISettingsResponse(s store.AIAnalysisSettings) aiSettingsResponse {
	out := aiSettingsResponse{
		Enabled:   s.Enabled,
		Provider:  s.Provider,
		BaseURL:   s.BaseURL,
		Model:     s.Model,
		HasAPIKey: s.HasAPIKey,
	}
	if !s.UpdatedAt.IsZero() {
		out.UpdatedAt = s.UpdatedAt.UTC().Format(timeRFC3339)
	}
	return out
}

func toAIAnalysisResponse(a store.AIAnalysis) aiAnalysisResponse {
	return aiAnalysisResponse{
		ID:           a.ID,
		AlertID:      a.AlertID,
		EventID:      a.EventID,
		Status:       a.Status,
		Model:        a.Model,
		Assessment:   a.Assessment,
		ErrorMessage: a.ErrorMessage,
		CreatedBy:    a.CreatedBy,
		CreatedAt:    a.CreatedAt.UTC().Format(timeRFC3339),
	}
}

func truncateStr(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n]
}
