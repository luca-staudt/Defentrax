package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// AuditHandler serves GET /api/v1/audit-logs*.
type AuditHandler struct {
	Pool *pgxpool.Pool
}

type auditLogResponse struct {
	ID          uuid.UUID      `json:"id"`
	ActorUserID *uuid.UUID     `json:"actor_user_id,omitempty"`
	ActorEmail  string         `json:"actor_email,omitempty"`
	ActorType   string         `json:"actor_type"`
	Action      string         `json:"action"`
	EntityType  string         `json:"entity_type"`
	EntityID    *uuid.UUID     `json:"entity_id,omitempty"`
	Metadata    map[string]any `json:"metadata"`
	IPAddress   string         `json:"ip_address,omitempty"`
	UserAgent   string         `json:"user_agent,omitempty"`
	CreatedAt   string         `json:"created_at"`
}

func (h *AuditHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	var actorUserID uuid.UUID
	if s := q.Get("actor_user_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			badRequest(w, r, "invalid_input", "invalid actor_user_id")
			return
		}
		actorUserID = id
	}

	var since, until *time.Time
	if t := q.Get("since"); t != "" {
		parsed, err := time.Parse(time.RFC3339, t)
		if err != nil {
			badRequest(w, r, "invalid_input", "invalid since timestamp (RFC3339)")
			return
		}
		since = &parsed
	}
	if t := q.Get("until"); t != "" {
		parsed, err := time.Parse(time.RFC3339, t)
		if err != nil {
			badRequest(w, r, "invalid_input", "invalid until timestamp (RFC3339)")
			return
		}
		until = &parsed
	}

	rows, total, err := store.ListAuditLogs(r.Context(), h.Pool, store.AuditListFilter{
		Action:      q.Get("action"),
		ActorUserID: actorUserID,
		ActorEmail:  q.Get("user"),
		Search:      q.Get("q"),
		Since:       since,
		Until:       until,
		Limit:       limit,
		Offset:      offset,
	})
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]auditLogResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toAuditLogResponse(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"audit_logs": out,
		"total":      total,
		"limit":      limitOrDefault(limit),
		"offset":     offset,
	})
}

func (h *AuditHandler) Get(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	row, err := store.GetAuditLog(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "audit log not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toAuditLogResponse(row))
}

func toAuditLogResponse(r store.AuditLogRow) auditLogResponse {
	meta := map[string]any{}
	if len(r.Metadata) > 0 {
		_ = json.Unmarshal(r.Metadata, &meta)
	}
	if meta == nil {
		meta = map[string]any{}
	}
	return auditLogResponse{
		ID:          r.ID,
		ActorUserID: r.ActorUserID,
		ActorEmail:  r.ActorEmail,
		ActorType:   r.ActorType,
		Action:      r.Action,
		EntityType:  r.EntityType,
		EntityID:    r.EntityID,
		Metadata:    meta,
		IPAddress:   r.IPAddress,
		UserAgent:   r.UserAgent,
		CreatedAt:   r.CreatedAt.UTC().Format(timeRFC3339),
	}
}
