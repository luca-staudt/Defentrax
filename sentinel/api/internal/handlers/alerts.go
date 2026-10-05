package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	alertsvc "github.com/luca-staudt/Sentinel/sentinel/api/internal/alerts"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/realtime"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

// AlertsHandler serves /api/v1/alerts/*.
type AlertsHandler struct {
	Pool *pgxpool.Pool
	Hub  *realtime.Hub
}

type alertResponse struct {
	ID              uuid.UUID  `json:"id"`
	ServerID        uuid.UUID  `json:"server_id"`
	RuleID          uuid.UUID  `json:"rule_id,omitempty"`
	AssignedTo      *uuid.UUID `json:"assigned_to,omitempty"`
	Title           string     `json:"title"`
	Description     string     `json:"description"`
	Status          string     `json:"status"`
	Severity        string     `json:"severity"`
	SourceIP        string     `json:"source_ip,omitempty"`
	EventCount      int        `json:"event_count"`
	FirstSeenAt     string     `json:"first_seen_at"`
	LastSeenAt      string     `json:"last_seen_at"`
	ResolutionNotes string     `json:"resolution_notes,omitempty"`
	OpenedAt        string     `json:"opened_at"`
	AcknowledgedAt  *string    `json:"acknowledged_at,omitempty"`
	InvestigatingAt *string    `json:"investigating_at,omitempty"`
	ResolvedAt      *string    `json:"resolved_at,omitempty"`
	CreatedAt       string     `json:"created_at"`
	UpdatedAt       string     `json:"updated_at"`
}

type timelineResponse struct {
	ID        uuid.UUID  `json:"id"`
	EventType string     `json:"event_type"`
	Message   string     `json:"message"`
	ActorID   *uuid.UUID `json:"actor_user_id,omitempty"`
	Metadata  any        `json:"metadata,omitempty"`
	CreatedAt string     `json:"created_at"`
}

func (h *AlertsHandler) List(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))
	var serverID uuid.UUID
	if s := q.Get("server_id"); s != "" {
		id, err := uuid.Parse(s)
		if err != nil {
			badRequest(w, r, "invalid_input", "invalid server_id")
			return
		}
		serverID = id
	}
	rows, total, err := store.ListAlerts(r.Context(), h.Pool, store.AlertListFilter{
		Status:   q.Get("status"),
		Severity: q.Get("severity"),
		ServerID: serverID,
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]alertResponse, 0, len(rows))
	for _, a := range rows {
		out = append(out, toAlertResponse(a))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"alerts": out,
		"total":  total,
		"limit":  limitOrDefault(limit),
		"offset": offset,
	})
}

func (h *AlertsHandler) Get(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	a, err := store.GetAlertByID(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "alert not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	timeline, err := store.ListAlertTimeline(r.Context(), h.Pool, id)
	if err != nil {
		internalError(w, r)
		return
	}
	tl := make([]timelineResponse, 0, len(timeline))
	for _, e := range timeline {
		tl = append(tl, timelineResponse{
			ID:        e.ID,
			EventType: e.EventType,
			Message:   e.Message,
			ActorID:   e.ActorUserID,
			Metadata:  jsonRawOrEmpty(e.Metadata),
			CreatedAt: e.CreatedAt.UTC().Format(timeRFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"alert":    toAlertResponse(*a),
		"timeline": tl,
	})
}

type patchAlertRequest struct {
	Status          *string    `json:"status"`
	AssignedTo      *uuid.UUID `json:"assigned_to"`
	ResolutionNotes *string    `json:"resolution_notes"`
}

func (h *AlertsHandler) Patch(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	var req patchAlertRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if req.Status == nil && req.AssignedTo == nil && req.ResolutionNotes == nil {
		badRequest(w, r, "invalid_input", "at least one field required")
		return
	}

	current, err := store.GetAlertByID(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "alert not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}

	if req.Status != nil && *req.Status != current.Status {
		if err := alertsvc.ValidateTransition(current.Status, *req.Status); err != nil {
			code := "invalid_transition"
			status := http.StatusConflict
			if errors.Is(err, alertsvc.ErrTerminalStatus) {
				code = "alert_resolved"
			}
			apperrors.WriteJSON(w, status, code, err.Error(), middleware.RequestIDFromContext(r.Context()))
			return
		}
	}

	var actor *uuid.UUID
	if p, ok := principal.FromContext(r.Context()); ok {
		actor = &p.UserID
	}

	upd := store.AlertStatusUpdate{ActorUserID: actor}
	if req.Status != nil {
		upd.Status = *req.Status
	}
	if req.AssignedTo != nil {
		upd.AssignedTo = req.AssignedTo
	}
	if req.ResolutionNotes != nil {
		upd.ResolutionNotes = *req.ResolutionNotes
	}

	updated, err := store.UpdateAlertLifecycle(r.Context(), h.Pool, id, upd)
	if err != nil {
		internalError(w, r)
		return
	}

	meta := map[string]any{}
	if req.Status != nil && *req.Status != current.Status {
		meta["from_status"] = current.Status
		meta["to_status"] = *req.Status
		h.auditAlert(r, actor, auditActionForStatus(*req.Status), id, meta)
	}
	if req.AssignedTo != nil {
		h.auditAlert(r, actor, "alert.assigned", id, map[string]any{"assigned_to": req.AssignedTo.String()})
	}

	if h.Hub != nil {
		h.Hub.Publish(realtime.AlertEvent{
			Type:       "alert.updated",
			AlertID:    updated.ID,
			ServerID:   updated.ServerID,
			Status:     updated.Status,
			Severity:   updated.Severity,
			Title:      updated.Title,
			EventCount: updated.EventCount,
		})
	}

	writeJSON(w, http.StatusOK, toAlertResponse(*updated))
}

func (h *AlertsHandler) RecentEvents(w http.ResponseWriter, r *http.Request) {
	if h.Hub == nil {
		writeJSON(w, http.StatusOK, map[string]any{"events": []any{}})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": h.Hub.Recent(50)})
}

func (h *AlertsHandler) auditAlert(r *http.Request, actor *uuid.UUID, action string, alertID uuid.UUID, meta map[string]any) {
	_ = store.Audit(r.Context(), h.Pool, actor, "user", action, "alert", &alertID, meta, parseClientIP(r), r.UserAgent())
}

func auditActionForStatus(status string) string {
	switch status {
	case alertsvc.StatusAcknowledged:
		return "alert.acknowledged"
	case alertsvc.StatusInvestigating:
		return "alert.investigating"
	case alertsvc.StatusResolved:
		return "alert.resolved"
	default:
		return "alert.status_changed"
	}
}

func toAlertResponse(a store.Alert) alertResponse {
	return alertResponse{
		ID:              a.ID,
		ServerID:        a.ServerID,
		RuleID:          a.RuleID,
		AssignedTo:      a.AssignedTo,
		Title:           a.Title,
		Description:     a.Description,
		Status:          a.Status,
		Severity:        a.Severity,
		SourceIP:        a.SourceIP,
		EventCount:      a.EventCount,
		FirstSeenAt:     a.FirstSeenAt.UTC().Format(timeRFC3339),
		LastSeenAt:      a.LastSeenAt.UTC().Format(timeRFC3339),
		ResolutionNotes: a.ResolutionNotes,
		OpenedAt:        a.OpenedAt.UTC().Format(timeRFC3339),
		AcknowledgedAt:  formatTimePtr(a.AcknowledgedAt),
		InvestigatingAt: formatTimePtr(a.InvestigatingAt),
		ResolvedAt:      formatTimePtr(a.ResolvedAt),
		CreatedAt:       a.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:       a.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func limitOrDefault(limit int) int {
	if limit < 1 {
		return 50
	}
	return limit
}

func formatTimePtr(t *time.Time) *string {
	if t == nil {
		return nil
	}
	s := t.UTC().Format(timeRFC3339)
	return &s
}

func jsonRawOrEmpty(b []byte) any {
	if len(b) == 0 {
		return map[string]any{}
	}
	var v any
	if err := json.Unmarshal(b, &v); err != nil {
		return map[string]any{}
	}
	return v
}
