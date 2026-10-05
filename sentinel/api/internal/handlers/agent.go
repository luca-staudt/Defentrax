package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/agentctx"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

// AgentHandler serves agent enrollment, heartbeat, and minimal event ingestion.
type AgentHandler struct {
	Pool *pgxpool.Pool
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

func (h *AgentHandler) IngestEvents(w http.ResponseWriter, r *http.Request) {
	a, ok := agentctx.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "agent authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req ingestEventsRequest
	if err := decodeJSON(r, &req); err != nil || len(req.Events) == 0 {
		badRequest(w, r, "invalid_input", "events array required")
		return
	}
	if len(req.Events) > 100 {
		badRequest(w, r, "invalid_input", "too many events in batch (max 100)")
		return
	}
	accepted := 0
	duplicates := 0
	for _, ev := range req.Events {
		if err := validateCanonicalEvent(ev); err != nil {
			badRequest(w, r, "invalid_event", err.Error())
			return
		}
		raw, _ := json.Marshal(ev.Raw)
		if len(raw) == 0 {
			raw = []byte("{}")
		}
		fields, _ := json.Marshal(ev.Fields)
		if len(fields) == 0 {
			fields = []byte("{}")
		}
		id, err := store.InsertEvent(r.Context(), h.Pool, a.ID, a.ServerID, ev.IngestID, ev.OccurredAt.UTC(), ev.Source, ev.Category, ev.Severity, ev.Host, ev.Message, ev.Fingerprint, raw, fields)
		if err != nil {
			internalError(w, r)
			return
		}
		if id == uuid.Nil {
			duplicates++
			continue
		}
		accepted++
	}
	writeJSON(w, http.StatusAccepted, map[string]any{
		"accepted":   accepted,
		"duplicates": duplicates,
	})
}

func validateCanonicalEvent(ev event.CanonicalEvent) error {
	if ev.IngestID == "" || len(ev.IngestID) > 128 {
		return errors.New("ingest_id required (max 128 chars)")
	}
	if ev.Source == "" || len(ev.Source) > 64 {
		return errors.New("source required (max 64 chars)")
	}
	if ev.Message == "" || len(ev.Message) > 8192 {
		return errors.New("message required (max 8192 chars)")
	}
	if ev.OccurredAt.IsZero() {
		return errors.New("occurred_at required")
	}
	sev := ev.Severity
	if sev == "" {
		sev = "info"
	}
	switch sev {
	case "info", "low", "medium", "high", "critical":
	default:
		return errors.New("invalid severity")
	}
	return nil
}
