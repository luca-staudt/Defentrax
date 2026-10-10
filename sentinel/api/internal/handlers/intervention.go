package handlers

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/agentctx"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// InterventionHandler serves admin intervention policy and action review APIs.
type InterventionHandler struct {
	Pool *pgxpool.Pool
}

type interventionSettingsResponse struct {
	ID                uuid.UUID  `json:"id,omitempty"`
	Scope             string     `json:"scope"`
	ServerID          *uuid.UUID `json:"server_id,omitempty"`
	Enabled           bool       `json:"enabled"`
	Mode              string     `json:"mode"`
	AllowBlockIP      bool       `json:"allow_block_ip"`
	AllowKillProcess  bool       `json:"allow_kill_process"`
	AllowFirewallRule bool       `json:"allow_firewall_rule"`
	DryRun            bool       `json:"dry_run"`
	ProtectedCIDRs    []string   `json:"protected_cidrs"`
	Source            string     `json:"source,omitempty"`
	UpdatedAt         string     `json:"updated_at,omitempty"`
}

type putInterventionSettingsRequest struct {
	Enabled           *bool    `json:"enabled"`
	Mode              *string  `json:"mode"`
	AllowBlockIP      *bool    `json:"allow_block_ip"`
	AllowKillProcess  *bool    `json:"allow_kill_process"`
	AllowFirewallRule *bool    `json:"allow_firewall_rule"`
	DryRun            *bool    `json:"dry_run"`
	ProtectedCIDRs    []string `json:"protected_cidrs"`
}

type interventionActionResponse struct {
	ID            uuid.UUID       `json:"id"`
	ServerID      uuid.UUID       `json:"server_id"`
	AgentID       *uuid.UUID      `json:"agent_id,omitempty"`
	AlertID       *uuid.UUID      `json:"alert_id,omitempty"`
	EventID       *uuid.UUID      `json:"event_id,omitempty"`
	ActionType    string          `json:"action_type"`
	Payload       json.RawMessage `json:"payload"`
	Status        string          `json:"status"`
	ModeAtRequest string          `json:"mode_at_request"`
	Reason        string          `json:"reason"`
	RequestedBy   *uuid.UUID      `json:"requested_by,omitempty"`
	DecidedBy     *uuid.UUID      `json:"decided_by,omitempty"`
	DecidedAt     *string         `json:"decided_at,omitempty"`
	QueuedAt      *string         `json:"queued_at,omitempty"`
	CompletedAt   *string         `json:"completed_at,omitempty"`
	Result        json.RawMessage `json:"result"`
	ErrorMessage  string          `json:"error_message,omitempty"`
	CreatedAt     string          `json:"created_at"`
	UpdatedAt     string          `json:"updated_at"`
}

type createInterventionActionRequest struct {
	ServerID   uuid.UUID       `json:"server_id"`
	AgentID    *uuid.UUID      `json:"agent_id"`
	AlertID    *uuid.UUID      `json:"alert_id"`
	EventID    *uuid.UUID      `json:"event_id"`
	ActionType string          `json:"action_type"`
	Payload    json.RawMessage `json:"payload"`
	Reason     string          `json:"reason"`
}

func (h *InterventionHandler) GetSettings(w http.ResponseWriter, r *http.Request) {
	s, err := store.GetGlobalInterventionSettings(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toInterventionSettingsResponse(s, "global"))
}

func (h *InterventionHandler) PutSettings(w http.ResponseWriter, r *http.Request) {
	var req putInterventionSettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if req.Mode != nil && !store.ValidateInterventionMode(*req.Mode) {
		badRequest(w, r, "invalid_mode", "mode must be observe, suggest, or act")
		return
	}
	if err := validateProtectedCIDRs(req.ProtectedCIDRs); err != nil {
		badRequest(w, r, "invalid_cidrs", err.Error())
		return
	}
	actor := actorID(r)
	s, err := store.UpsertGlobalInterventionSettings(r.Context(), h.Pool, store.InterventionSettingsUpdate{
		Enabled:           req.Enabled,
		Mode:              req.Mode,
		AllowBlockIP:      req.AllowBlockIP,
		AllowKillProcess:  req.AllowKillProcess,
		AllowFirewallRule: req.AllowFirewallRule,
		DryRun:            req.DryRun,
		ProtectedCIDRs:    req.ProtectedCIDRs,
		UpdatedBy:         actor,
	})
	if err != nil {
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, actor, "user", "intervention.settings.update", "intervention_settings", &s.ID, map[string]any{
		"enabled": s.Enabled, "mode": s.Mode, "dry_run": s.DryRun,
		"allow_block_ip": s.AllowBlockIP, "allow_kill_process": s.AllowKillProcess, "allow_firewall_rule": s.AllowFirewallRule,
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusOK, toInterventionSettingsResponse(s, "global"))
}

func (h *InterventionHandler) GetServerSettings(w http.ResponseWriter, r *http.Request, serverID uuid.UUID) {
	eff, err := store.ResolveInterventionSettings(r.Context(), h.Pool, serverID)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toInterventionSettingsResponse(eff.Settings, eff.Source))
}

func (h *InterventionHandler) PutServerSettings(w http.ResponseWriter, r *http.Request, serverID uuid.UUID) {
	var req putInterventionSettingsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if req.Mode != nil && !store.ValidateInterventionMode(*req.Mode) {
		badRequest(w, r, "invalid_mode", "mode must be observe, suggest, or act")
		return
	}
	if err := validateProtectedCIDRs(req.ProtectedCIDRs); err != nil {
		badRequest(w, r, "invalid_cidrs", err.Error())
		return
	}
	actor := actorID(r)
	s, err := store.UpsertServerInterventionSettings(r.Context(), h.Pool, serverID, store.InterventionSettingsUpdate{
		Enabled:           req.Enabled,
		Mode:              req.Mode,
		AllowBlockIP:      req.AllowBlockIP,
		AllowKillProcess:  req.AllowKillProcess,
		AllowFirewallRule: req.AllowFirewallRule,
		DryRun:            req.DryRun,
		ProtectedCIDRs:    req.ProtectedCIDRs,
		UpdatedBy:         actor,
	})
	if err != nil {
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, actor, "user", "intervention.server_settings.update", "server", &serverID, map[string]any{
		"enabled": s.Enabled, "mode": s.Mode, "dry_run": s.DryRun,
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusOK, toInterventionSettingsResponse(s, "server"))
}

func (h *InterventionHandler) DeleteServerSettings(w http.ResponseWriter, r *http.Request, serverID uuid.UUID) {
	if err := store.DeleteServerInterventionSettings(r.Context(), h.Pool, serverID); err != nil {
		internalError(w, r)
		return
	}
	actor := actorID(r)
	_ = store.Audit(r.Context(), h.Pool, actor, "user", "intervention.server_settings.delete", "server", &serverID, nil, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (h *InterventionHandler) ListActions(w http.ResponseWriter, r *http.Request) {
	f := store.InterventionActionListFilter{
		Status: strings.TrimSpace(r.URL.Query().Get("status")),
	}
	if sid := strings.TrimSpace(r.URL.Query().Get("server_id")); sid != "" {
		id, err := uuid.Parse(sid)
		if err != nil {
			badRequest(w, r, "invalid_id", "invalid server_id")
			return
		}
		f.ServerID = id
	}
	if lim, err := strconv.Atoi(r.URL.Query().Get("limit")); err == nil {
		f.Limit = lim
	}
	if off, err := strconv.Atoi(r.URL.Query().Get("offset")); err == nil {
		f.Offset = off
	}
	rows, total, err := store.ListInterventionActions(r.Context(), h.Pool, f)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]interventionActionResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toInterventionActionResponse(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"actions": out, "total": total})
}

func (h *InterventionHandler) CreateAction(w http.ResponseWriter, r *http.Request) {
	var req createInterventionActionRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	req.ActionType = strings.ToLower(strings.TrimSpace(req.ActionType))
	if req.ServerID == uuid.Nil || !store.ValidateInterventionType(req.ActionType) {
		badRequest(w, r, "invalid_input", "server_id and valid action_type required")
		return
	}
	if err := validateInterventionPayload(req.ActionType, req.Payload); err != nil {
		badRequest(w, r, "invalid_payload", err.Error())
		return
	}
	eff, err := store.ResolveInterventionSettings(r.Context(), h.Pool, req.ServerID)
	if err != nil {
		internalError(w, r)
		return
	}
	s := eff.Settings
	if !s.Enabled {
		badRequest(w, r, "intervention_disabled", "intervention is disabled for this scope")
		return
	}
	if s.Mode == "observe" {
		badRequest(w, r, "observe_only", "intervention mode is observe-only; enable suggest or act first")
		return
	}
	if !capabilityAllowed(s, req.ActionType) {
		badRequest(w, r, "capability_disabled", "this action type is not allowed by policy")
		return
	}
	if err := assertPayloadNotProtected(s.ProtectedCIDRs, req.ActionType, req.Payload); err != nil {
		badRequest(w, r, "protected_target", err.Error())
		return
	}

	status := "pending"
	if s.Mode == "act" {
		status = "queued"
	}
	actor := actorID(r)
	action, err := store.CreateInterventionAction(r.Context(), h.Pool, store.InterventionActionCreate{
		ServerID:      req.ServerID,
		AgentID:       req.AgentID,
		AlertID:       req.AlertID,
		EventID:       req.EventID,
		ActionType:    req.ActionType,
		Payload:       req.Payload,
		Status:        status,
		ModeAtRequest: s.Mode,
		Reason:        strings.TrimSpace(req.Reason),
		RequestedBy:   actor,
	})
	if err != nil {
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, actor, "user", "intervention.action.create", "intervention_action", &action.ID, map[string]any{
		"action_type": action.ActionType, "status": action.Status, "server_id": action.ServerID.String(), "mode": action.ModeAtRequest,
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusCreated, toInterventionActionResponse(action))
}

func (h *InterventionHandler) ApproveAction(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	h.decideAction(w, r, id, true)
}

func (h *InterventionHandler) DenyAction(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	h.decideAction(w, r, id, false)
}

func (h *InterventionHandler) decideAction(w http.ResponseWriter, r *http.Request, id uuid.UUID, approve bool) {
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	action, err := store.DecideInterventionAction(r.Context(), h.Pool, id, approve, p.UserID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "action not found or not pending", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	name := "intervention.action.deny"
	if approve {
		name = "intervention.action.approve"
	}
	_ = store.Audit(r.Context(), h.Pool, &p.UserID, "user", name, "intervention_action", &action.ID, map[string]any{
		"status": action.Status, "action_type": action.ActionType,
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusOK, toInterventionActionResponse(action))
}

// AgentCapabilities returns the intervention policy attached to heartbeat responses.
func AgentInterventionCapabilities(ctxSettings store.InterventionSettings, source string) map[string]any {
	return map[string]any{
		"enabled": ctxSettings.Enabled && ctxSettings.Mode != "observe",
		"mode":    ctxSettings.Mode,
		"source":  source,
		"dry_run": ctxSettings.DryRun,
		"capabilities": map[string]bool{
			"block_ip":      ctxSettings.Enabled && ctxSettings.Mode == "act" && ctxSettings.AllowBlockIP,
			"kill_process":  ctxSettings.Enabled && ctxSettings.Mode == "act" && ctxSettings.AllowKillProcess,
			"firewall_rule": ctxSettings.Enabled && ctxSettings.Mode == "act" && ctxSettings.AllowFirewallRule,
		},
		"can_poll_actions": ctxSettings.Enabled && (ctxSettings.Mode == "suggest" || ctxSettings.Mode == "act"),
		"protected_cidrs":  ctxSettings.ProtectedCIDRs,
	}
}

func (h *InterventionHandler) AgentListPending(w http.ResponseWriter, r *http.Request) {
	a, ok := agentctx.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "agent authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	eff, err := store.ResolveInterventionSettings(r.Context(), h.Pool, a.ServerID)
	if err != nil {
		internalError(w, r)
		return
	}
	if !eff.Settings.Enabled || eff.Settings.Mode == "observe" {
		writeJSON(w, http.StatusOK, map[string]any{"actions": []any{}})
		return
	}
	rows, err := store.ListQueuedInterventionActionsForAgent(r.Context(), h.Pool, a.ID, a.ServerID, 20)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]interventionActionResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toInterventionActionResponse(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"actions": out})
}

type agentInterventionResultRequest struct {
	Success bool            `json:"success"`
	Result  json.RawMessage `json:"result"`
	Error   string          `json:"error"`
}

func (h *InterventionHandler) AgentReportResult(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	a, ok := agentctx.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "agent authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req agentInterventionResultRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	cur, err := store.GetInterventionAction(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "action not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	if cur.ServerID != a.ServerID {
		apperrors.WriteJSON(w, http.StatusForbidden, "forbidden", "action not for this agent server", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if cur.Status == "queued" {
		if _, err := store.MarkInterventionActionRunning(r.Context(), h.Pool, id, a.ID); err != nil && !errors.Is(err, store.ErrNotFound) {
			internalError(w, r)
			return
		}
	}
	action, err := store.CompleteInterventionAction(r.Context(), h.Pool, id, req.Success, req.Result, strings.TrimSpace(req.Error))
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusConflict, "conflict", "action not in runnable state", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	_ = store.Audit(r.Context(), h.Pool, nil, "agent", "intervention.action.result", "intervention_action", &action.ID, map[string]any{
		"status": action.Status, "success": req.Success, "agent_id": a.ID.String(),
	}, parseClientIP(r), r.UserAgent())
	writeJSON(w, http.StatusOK, toInterventionActionResponse(action))
}

func toInterventionSettingsResponse(s store.InterventionSettings, source string) interventionSettingsResponse {
	out := interventionSettingsResponse{
		ID:                s.ID,
		Scope:             s.Scope,
		ServerID:          s.ServerID,
		Enabled:           s.Enabled,
		Mode:              s.Mode,
		AllowBlockIP:      s.AllowBlockIP,
		AllowKillProcess:  s.AllowKillProcess,
		AllowFirewallRule: s.AllowFirewallRule,
		DryRun:            s.DryRun,
		ProtectedCIDRs:    s.ProtectedCIDRs,
		Source:            source,
	}
	if !s.UpdatedAt.IsZero() {
		out.UpdatedAt = s.UpdatedAt.UTC().Format(timeRFC3339)
	}
	if out.ProtectedCIDRs == nil {
		out.ProtectedCIDRs = []string{}
	}
	return out
}

func toInterventionActionResponse(a store.InterventionAction) interventionActionResponse {
	return interventionActionResponse{
		ID:            a.ID,
		ServerID:      a.ServerID,
		AgentID:       a.AgentID,
		AlertID:       a.AlertID,
		EventID:       a.EventID,
		ActionType:    a.ActionType,
		Payload:       a.Payload,
		Status:        a.Status,
		ModeAtRequest: a.ModeAtRequest,
		Reason:        a.Reason,
		RequestedBy:   a.RequestedBy,
		DecidedBy:     a.DecidedBy,
		DecidedAt:     formatOptionalTime(a.DecidedAt),
		QueuedAt:      formatOptionalTime(a.QueuedAt),
		CompletedAt:   formatOptionalTime(a.CompletedAt),
		Result:        a.Result,
		ErrorMessage:  a.ErrorMessage,
		CreatedAt:     a.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:     a.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func capabilityAllowed(s store.InterventionSettings, actionType string) bool {
	switch actionType {
	case "block_ip":
		return s.AllowBlockIP
	case "kill_process":
		return s.AllowKillProcess
	case "firewall_rule":
		return s.AllowFirewallRule
	default:
		return false
	}
}

func validateProtectedCIDRs(cidrs []string) error {
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, _, err := net.ParseCIDR(c); err != nil {
			if ip := net.ParseIP(c); ip == nil {
				return errors.New("protected_cidrs entries must be IPs or CIDRs")
			}
		}
	}
	return nil
}

func validateInterventionPayload(actionType string, payload json.RawMessage) error {
	if len(payload) == 0 {
		payload = json.RawMessage(`{}`)
	}
	var m map[string]any
	if err := json.Unmarshal(payload, &m); err != nil {
		return errors.New("payload must be a JSON object")
	}
	switch actionType {
	case "block_ip":
		ip, _ := m["ip"].(string)
		if net.ParseIP(strings.TrimSpace(ip)) == nil {
			return errors.New("block_ip requires payload.ip")
		}
	case "kill_process":
		switch v := m["pid"].(type) {
		case float64:
			if v < 2 {
				return errors.New("kill_process requires payload.pid >= 2")
			}
		default:
			return errors.New("kill_process requires numeric payload.pid")
		}
	case "firewall_rule":
		rule, _ := m["rule"].(string)
		if strings.TrimSpace(rule) == "" {
			return errors.New("firewall_rule requires payload.rule")
		}
		if len(rule) > 512 {
			return errors.New("firewall_rule payload.rule too long")
		}
	}
	return nil
}

func assertPayloadNotProtected(cidrs []string, actionType string, payload json.RawMessage) error {
	if actionType != "block_ip" || len(cidrs) == 0 {
		return nil
	}
	var m map[string]any
	_ = json.Unmarshal(payload, &m)
	ipStr, _ := m["ip"].(string)
	ip := net.ParseIP(strings.TrimSpace(ipStr))
	if ip == nil {
		return nil
	}
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, network, err := net.ParseCIDR(c); err == nil {
			if network.Contains(ip) {
				return errors.New("target IP is in a protected CIDR")
			}
			continue
		}
		if protected := net.ParseIP(c); protected != nil && protected.Equal(ip) {
			return errors.New("target IP is protected")
		}
	}
	return nil
}
