package handlers

import (
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/agentctx"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

// AgentHandler serves agent enrollment, heartbeat, and event ingestion.
type AgentHandler struct {
	Pool          *pgxpool.Pool
	Config        config.Config
	IngestLimiter ratelimit.Limiter
}

type enrollRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	Name            string `json:"name"`
	Hostname        string `json:"hostname"`
	AgentVersion    string `json:"agent_version"`
}

type enrollResponse struct {
	AgentID     uuid.UUID `json:"agent_id"`
	ServerID    uuid.UUID `json:"server_id"`
	AgentToken  string    `json:"agent_token"`
	TokenPrefix string    `json:"token_prefix"`
}

type heartbeatRequest struct {
	AgentVersion string `json:"agent_version"`
}

type ingestEventsRequest struct {
	Events []event.CanonicalEvent `json:"events"`
}

func (h *AgentHandler) Enroll(w http.ResponseWriter, r *http.Request) {
	var req enrollRequest
	if err := decodeJSON(r, &req); err != nil || req.EnrollmentToken == "" {
		badRequest(w, r, "invalid_input", "enrollment_token required")
		return
	}
	if !secrets.LooksLikeEnrollmentToken(req.EnrollmentToken) {
		badRequest(w, r, "invalid_input", "invalid enrollment token")
		return
	}
	hash := secrets.HashToken(req.EnrollmentToken)
	rec, err := store.GetEnrollmentTokenByHash(r.Context(), h.Pool, hash)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			badRequest(w, r, "invalid_token", "enrollment token not found")
			return
		}
		internalError(w, r)
		return
	}
	now := time.Now().UTC()
	if rec.RevokedAt != nil || rec.UsedAt != nil || now.After(rec.ExpiresAt) {
		badRequest(w, r, "invalid_token", "enrollment token expired or already used")
		return
	}
	name := req.Name
	if name == "" {
		name = req.Hostname
	}
	if name == "" {
		name = "agent"
	}
	agent, err := store.CreateAgent(r.Context(), h.Pool, rec.ServerID, name, req.AgentVersion)
	if err != nil {
		internalError(w, r)
		return
	}
	if err := store.MarkEnrollmentTokenUsed(r.Context(), h.Pool, rec.ID, agent.ID); err != nil {
		internalError(w, r)
		return
	}
	full, prefix, tokenHash, err := secrets.AgentTokenMaterial()
	if err != nil {
		internalError(w, r)
		return
	}
	if _, err := store.CreateAgentToken(r.Context(), h.Pool, agent.ID, tokenHash, prefix, "enrollment"); err != nil {
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, nil, "agent", "agent.enroll", "agent", &agent.ID, map[string]any{
		"server_id":    rec.ServerID.String(),
		"token_prefix": prefix,
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusCreated, enrollResponse{
		AgentID:     agent.ID,
		ServerID:    rec.ServerID,
		AgentToken:  full,
		TokenPrefix: prefix,
	})
}

func (h *AgentHandler) Heartbeat(w http.ResponseWriter, r *http.Request) {
	a, ok := agentctx.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "agent authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req heartbeatRequest
	if r.ContentLength > 0 {
		_ = decodeJSON(r, &req)
	}
	if err := store.TouchAgentHeartbeat(r.Context(), h.Pool, a.ID, req.AgentVersion); err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"status": "ok", "agent_id": a.ID})
}

