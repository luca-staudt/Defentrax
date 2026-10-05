package handlers

import (
	"errors"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

// EventsHandler serves /api/v1/events/*.
type EventsHandler struct {
	Pool *pgxpool.Pool
}

type eventResponse struct {
	ID         uuid.UUID `json:"id"`
	AgentID    uuid.UUID `json:"agent_id"`
	ServerID   uuid.UUID `json:"server_id"`
	ReceivedAt string    `json:"received_at"`
	OccurredAt string    `json:"occurred_at"`
	Source     string    `json:"source"`
	Category   string    `json:"category"`
	Severity   string    `json:"severity"`
	Host       string    `json:"host"`
	Message    string    `json:"message"`
	IngestID   string    `json:"ingest_id"`
}

func (h *EventsHandler) List(w http.ResponseWriter, r *http.Request) {
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
	var since, until *time.Time
	if t := q.Get("since"); t != "" {
		parsed, err := time.Parse(time.RFC3339, t)
		if err != nil {
			badRequest(w, r, "invalid_input", "invalid since timestamp")
			return
		}
		since = &parsed
	}
	if t := q.Get("until"); t != "" {
		parsed, err := time.Parse(time.RFC3339, t)
		if err != nil {
			badRequest(w, r, "invalid_input", "invalid until timestamp")
			return
		}
		until = &parsed
	}
	rows, total, err := store.ListEvents(r.Context(), h.Pool, store.EventListFilter{
		ServerID: serverID,
		Severity: q.Get("severity"),
		Source:   q.Get("source"),
		Category: q.Get("category"),
		Search:   q.Get("q"),
		Since:    since,
		Until:    until,
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]eventResponse, 0, len(rows))
	for _, e := range rows {
		out = append(out, toEventResponse(e))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"events": out,
		"total":  total,
		"limit":  limitOrDefault(limit),
		"offset": offset,
	})
}

func (h *EventsHandler) Get(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	e, err := store.GetEventByID(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "event not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toEventResponse(e))
}

func toEventResponse(e store.EventRow) eventResponse {
	return eventResponse{
		ID:         e.ID,
		AgentID:    e.AgentID,
		ServerID:   e.ServerID,
		ReceivedAt: e.ReceivedAt.UTC().Format(timeRFC3339),
		OccurredAt: e.OccurredAt.UTC().Format(timeRFC3339),
		Source:     e.Source,
		Category:   e.Category,
		Severity:   e.Severity,
		Host:       e.Host,
		Message:    e.Message,
		IngestID:   e.IngestID,
	}
}
