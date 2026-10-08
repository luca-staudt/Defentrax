package handlers

import (
	"errors"
	"net"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// ServersHandler manages infrastructure targets and agent enrollment tokens.
type ServersHandler struct {
	Pool *pgxpool.Pool
}

type createServerRequest struct {
	Name        string `json:"name"`
	Hostname    string `json:"hostname"`
	Description string `json:"description"`
	Environment string `json:"environment"`
}

type serverResponse struct {
	ID              uuid.UUID `json:"id"`
	Name            string    `json:"name"`
	Hostname        string    `json:"hostname"`
	CreatedAt       string    `json:"created_at"`
	SilencedUntil   *string   `json:"silenced_until,omitempty"`
	LastHeartbeatAt *string   `json:"last_heartbeat_at,omitempty"`
	LastEventAt     *string   `json:"last_event_at,omitempty"`
	AgentCount      int       `json:"agent_count"`
	Silent          bool      `json:"silent"`
}

type agentResponse struct {
	ID              uuid.UUID `json:"id"`
	ServerID        uuid.UUID `json:"server_id"`
	Name            string    `json:"name"`
	Status          string    `json:"status"`
	AgentVersion    string    `json:"agent_version"`
	LastHeartbeatAt *string   `json:"last_heartbeat_at,omitempty"`
}

type serverDetailResponse struct {
	serverResponse
	Description string          `json:"description"`
	Environment string          `json:"environment"`
	Agents      []agentResponse `json:"agents"`
}

type createEnrollmentTokenRequest struct {
	Label      string `json:"label"`
	TTLMinutes int    `json:"ttl_minutes"`
}

type enrollmentTokenResponse struct {
	ID          uuid.UUID `json:"id"`
	ServerID    uuid.UUID `json:"server_id"`
	TokenPrefix string    `json:"token_prefix"`
	Token       string    `json:"token,omitempty"`
	ExpiresAt   string    `json:"expires_at"`
}

func (h *ServersHandler) List(w http.ResponseWriter, r *http.Request) {
	servers, err := store.ListServerSignals(r.Context(), h.Pool, time.Now().UTC().Add(-store.SilentHostAfter))
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]serverResponse, 0, len(servers))
	for _, s := range servers {
		out = append(out, signalResponse(s))
	}
	writeJSON(w, http.StatusOK, map[string]any{"servers": out})
}

func (h *ServersHandler) Get(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	d, err := store.GetServerByID(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "server not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	agents := make([]agentResponse, 0, len(d.Agents))
	for _, a := range d.Agents {
		agents = append(agents, toAgentResponse(a))
	}
	signal, err := store.ServerSignalByID(r.Context(), h.Pool, id, time.Now().UTC().Add(-store.SilentHostAfter))
	if err != nil && !errors.Is(err, store.ErrNotFound) {
		internalError(w, r)
		return
	}
	base := serverResponse{
		ID:        d.ID,
		Name:      d.Name,
		Hostname:  d.Hostname,
		CreatedAt: d.CreatedAt.UTC().Format(timeRFC3339),
	}
	if err == nil {
		base = signalResponse(signal)
	}
	writeJSON(w, http.StatusOK, serverDetailResponse{
		serverResponse: base,
		Description:    d.Description,
		Environment:    d.Environment,
		Agents:         agents,
	})
}

func signalResponse(s store.ServerSignal) serverResponse {
	return serverResponse{
		ID:              s.ID,
		Name:            s.Name,
		Hostname:        s.Hostname,
		CreatedAt:       s.CreatedAt.UTC().Format(timeRFC3339),
		SilencedUntil:   formatSilence(s.SilencedUntil),
		LastHeartbeatAt: formatOptionalTime(s.LastHeartbeatAt),
		LastEventAt:     formatOptionalTime(s.LastEventAt),
		AgentCount:      s.AgentCount,
		Silent:          s.Silent,
	}
}

func (h *ServersHandler) SetSilence(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	writeSilence(w, h.Pool, r, "server", id, func() error {
		_, err := store.GetServerByID(r.Context(), h.Pool, id)
		return err
	})
}

func (h *ServersHandler) ClearSilence(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	if _, err := store.GetServerByID(r.Context(), h.Pool, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "server not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	clearSilence(w, h.Pool, r, "server", id)
}

func toAgentResponse(a store.AgentRecord) agentResponse {
	var hb *string
	if a.LastHeartbeatAt != nil {
		s := a.LastHeartbeatAt.UTC().Format(timeRFC3339)
		hb = &s
	}
	return agentResponse{
		ID:              a.ID,
		ServerID:        a.ServerID,
		Name:            a.Name,
		Status:          a.Status,
		AgentVersion:    a.AgentVersion,
		LastHeartbeatAt: hb,
	}
}

func (h *ServersHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req createServerRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		badRequest(w, r, "invalid_input", "name required")
		return
	}
	s, err := store.CreateServer(r.Context(), h.Pool, req.Name, req.Hostname, req.Description, req.Environment)
	if err != nil {
		internalError(w, r)
		return
	}
	p, _ := principal.FromContext(r.Context())
	var actor *uuid.UUID
	if p != nil {
		actor = &p.UserID
	}
	_ = store.Audit(r.Context(), h.Pool, actor, "user", "server.create", "server", &s.ID, map[string]any{"name": s.Name}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusCreated, serverResponse{
		ID:        s.ID,
		Name:      s.Name,
		Hostname:  s.Hostname,
		CreatedAt: s.CreatedAt.UTC().Format(timeRFC3339),
	})
}

func (h *ServersHandler) CreateEnrollmentToken(w http.ResponseWriter, r *http.Request, serverID uuid.UUID) {
	var req createEnrollmentTokenRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_input", "invalid json body")
		return
	}
	ttl := req.TTLMinutes
	if ttl <= 0 {
		ttl = 60
	}
	if ttl > 24*60 {
		ttl = 24 * 60
	}
	expires := time.Now().UTC().Add(time.Duration(ttl) * time.Minute)
	full, prefix, hash, err := secrets.EnrollmentTokenMaterial()
	if err != nil {
		internalError(w, r)
		return
	}
	p, _ := principal.FromContext(r.Context())
	var actor *uuid.UUID
	if p != nil {
		actor = &p.UserID
	}
	id, err := store.CreateEnrollmentToken(r.Context(), h.Pool, serverID, hash, prefix, req.Label, expires, actor)
	if err != nil {
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, actor, "user", "agent.enrollment_token.create", "server", &serverID, map[string]any{"token_id": id.String(), "token_prefix": prefix}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusCreated, enrollmentTokenResponse{
		ID:          id,
		ServerID:    serverID,
		TokenPrefix: prefix,
		Token:       full,
		ExpiresAt:   expires.Format(timeRFC3339),
	})
}

func parseClientIP(r *http.Request) net.IP {
	if ip := clientIP(r); ip != "" {
		return net.ParseIP(ip)
	}
	return nil
}
