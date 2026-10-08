package handlers

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/notify"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// NotificationsHandler serves admin APIs for channels and rules.
type NotificationsHandler struct {
	Pool       *pgxpool.Pool
	SecretsKey []byte
	Dispatcher *notify.Dispatcher
}

type channelSecretsRequest struct {
	WebhookURL   string            `json:"webhook_url"`
	SMTPPassword string            `json:"smtp_password"`
	Headers      map[string]string `json:"headers"`
}

type createChannelRequest struct {
	Name        string                 `json:"name"`
	ChannelType string                 `json:"channel_type"`
	Config      json.RawMessage        `json:"config"`
	Secrets     *channelSecretsRequest `json:"secrets"`
	Enabled     *bool                  `json:"enabled"`
}

type patchChannelRequest struct {
	Name    *string                `json:"name"`
	Config  json.RawMessage        `json:"config"`
	Secrets *channelSecretsRequest `json:"secrets"`
	Enabled *bool                  `json:"enabled"`
}

type channelResponse struct {
	ID          uuid.UUID       `json:"id"`
	Name        string          `json:"name"`
	ChannelType string          `json:"channel_type"`
	Config      json.RawMessage `json:"config"`
	HasSecrets  bool            `json:"has_secrets"`
	Enabled     bool            `json:"enabled"`
	CreatedAt   string          `json:"created_at"`
	UpdatedAt   string          `json:"updated_at"`
}

type createNotificationRuleRequest struct {
	Name        string      `json:"name"`
	Enabled     *bool       `json:"enabled"`
	MinSeverity string      `json:"min_severity"`
	Triggers    []string    `json:"triggers"`
	ChannelIDs  []uuid.UUID `json:"channel_ids"`
}

type patchNotificationRuleRequest struct {
	Name        *string     `json:"name"`
	Enabled     *bool       `json:"enabled"`
	MinSeverity *string     `json:"min_severity"`
	Triggers    []string    `json:"triggers"`
	ChannelIDs  []uuid.UUID `json:"channel_ids"`
}

type notificationRuleResponse struct {
	ID          uuid.UUID   `json:"id"`
	Name        string      `json:"name"`
	Enabled     bool        `json:"enabled"`
	MinSeverity string      `json:"min_severity"`
	Triggers    []string    `json:"triggers"`
	ChannelIDs  []uuid.UUID `json:"channel_ids"`
	CreatedAt   string      `json:"created_at"`
	UpdatedAt   string      `json:"updated_at"`
}

func (h *NotificationsHandler) ListChannels(w http.ResponseWriter, r *http.Request) {
	rows, err := store.ListNotificationChannels(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]channelResponse, 0, len(rows))
	for _, c := range rows {
		out = append(out, toChannelResponse(c))
	}
	writeJSON(w, http.StatusOK, map[string]any{"channels": out})
}

func (h *NotificationsHandler) GetChannel(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	c, err := store.GetNotificationChannel(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "channel not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toChannelResponse(c))
}

func (h *NotificationsHandler) CreateChannel(w http.ResponseWriter, r *http.Request) {
	if len(h.SecretsKey) != 32 {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "misconfigured", "SECRETS_ENCRYPTION_KEY (or TOTP_ENCRYPTION_KEY) required for notification channels", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req createChannelRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.ChannelType = strings.ToLower(strings.TrimSpace(req.ChannelType))
	if req.Name == "" || !notify.ValidChannelType(req.ChannelType) {
		badRequest(w, r, "invalid_input", "name and valid channel_type required")
		return
	}
	if len(req.Config) == 0 {
		req.Config = json.RawMessage(`{}`)
	}
	if err := validateChannelConfig(req.ChannelType, req.Config); err != nil {
		badRequest(w, r, "invalid_config", err.Error())
		return
	}
	secrets := secretsFromRequest(req.Secrets)
	if err := validateChannelSecrets(req.ChannelType, secrets); err != nil {
		badRequest(w, r, "invalid_secrets", err.Error())
		return
	}
	enc, err := notify.EncryptSecrets(h.SecretsKey, secrets)
	if err != nil {
		internalError(w, r)
		return
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	c, err := store.CreateNotificationChannel(r.Context(), h.Pool, store.ChannelCreateParams{
		Name:             req.Name,
		ChannelType:      req.ChannelType,
		Config:           req.Config,
		SecretsEncrypted: enc,
		HasSecrets:       secrets.HasAny(),
		Enabled:          enabled,
	})
	if err != nil {
		if isUniqueViolation(err) {
			badRequest(w, r, "conflict", "channel name already exists")
			return
		}
		internalError(w, r)
		return
	}
	h.audit(r, "notification_channel.create", "notification_channel", &c.ID, map[string]any{
		"name": c.Name, "channel_type": c.ChannelType, "has_secrets": c.HasSecrets,
	})
	writeJSON(w, http.StatusCreated, toChannelResponse(c))
}

func (h *NotificationsHandler) PatchChannel(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	if len(h.SecretsKey) != 32 {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "misconfigured", "SECRETS_ENCRYPTION_KEY (or TOTP_ENCRYPTION_KEY) required for notification channels", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req patchChannelRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	cur, err := store.GetNotificationChannel(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "channel not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	upd := store.ChannelUpdateParams{
		Name:    req.Name,
		Enabled: req.Enabled,
	}
	if req.Config != nil {
		if err := validateChannelConfig(cur.ChannelType, req.Config); err != nil {
			badRequest(w, r, "invalid_config", err.Error())
			return
		}
		upd.Config = req.Config
	}
	if req.Secrets != nil {
		secrets := secretsFromRequest(req.Secrets)
		if err := validateChannelSecrets(cur.ChannelType, secrets); err != nil {
			badRequest(w, r, "invalid_secrets", err.Error())
			return
		}
		enc, err := notify.EncryptSecrets(h.SecretsKey, secrets)
		if err != nil {
			internalError(w, r)
			return
		}
		upd.SecretsEncrypted = &enc
		has := secrets.HasAny()
		upd.HasSecrets = &has
	}
	c, err := store.UpdateNotificationChannel(r.Context(), h.Pool, id, upd)
	if err != nil {
		if isUniqueViolation(err) {
			badRequest(w, r, "conflict", "channel name already exists")
			return
		}
		internalError(w, r)
		return
	}
	h.audit(r, "notification_channel.update", "notification_channel", &c.ID, map[string]any{
		"name": c.Name, "has_secrets": c.HasSecrets,
	})
	writeJSON(w, http.StatusOK, toChannelResponse(c))
}

func (h *NotificationsHandler) DeleteChannel(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	if err := store.DeleteNotificationChannel(r.Context(), h.Pool, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "channel not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	h.audit(r, "notification_channel.delete", "notification_channel", &id, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *NotificationsHandler) ListDeliveries(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	if _, err := store.GetNotificationChannel(r.Context(), h.Pool, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "channel not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	limit, _ := strconv.Atoi(r.URL.Query().Get("limit"))
	rows, err := store.ListChannelDeliveries(r.Context(), h.Pool, id, limit)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]map[string]any, 0, len(rows))
	for _, row := range rows {
		item := map[string]any{
			"id":            row.ID,
			"alert_id":      row.AlertID,
			"alert_title":   row.AlertTitle,
			"status":        row.Status,
			"error":         row.Error,
			"attempt_count": row.AttemptCount,
			"trigger":       row.TriggerEvent,
			"created_at":    row.CreatedAt.UTC().Format(timeRFC3339),
		}
		if row.SentAt != nil {
			item["sent_at"] = row.SentAt.UTC().Format(timeRFC3339)
		}
		out = append(out, item)
	}
	writeJSON(w, http.StatusOK, map[string]any{"deliveries": out})
}

// TestChannel sends a synthetic notification via the existing dispatch send path.
// Requires notifications:write. Returns a safe error message (URLs redacted) on failure.
func (h *NotificationsHandler) TestChannel(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	if len(h.SecretsKey) != 32 {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "misconfigured", "SECRETS_ENCRYPTION_KEY (or TOTP_ENCRYPTION_KEY) required for notification channels", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if h.Dispatcher == nil {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "misconfigured", "notification dispatcher unavailable", middleware.RequestIDFromContext(r.Context()))
		return
	}
	ch, err := store.GetNotificationChannel(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "channel not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	if ch.ChannelType != notify.ChannelEmail && !ch.HasSecrets {
		apperrors.WriteJSON(w, http.StatusBadRequest, "missing_secrets", "channel has no secrets configured (webhook URL or SMTP credentials required)", middleware.RequestIDFromContext(r.Context()))
		return
	}

	err = h.Dispatcher.SendTest(r.Context(), ch)
	if err != nil {
		safe := notify.SafeError(err)
		if len(safe) > 800 {
			safe = safe[:800] + "…"
		}
		if notify.ContainsWebhookLeak(safe) {
			safe = "delivery failed (details redacted)"
		}
		h.audit(r, "notification_channel.test", "notification_channel", &ch.ID, map[string]any{
			"channel_type": ch.ChannelType,
			"channel_name": ch.Name,
			"ok":           false,
			"error":        safe,
		})
		apperrors.WriteJSON(w, http.StatusBadGateway, "delivery_failed", safe, middleware.RequestIDFromContext(r.Context()))
		return
	}

	h.audit(r, "notification_channel.test", "notification_channel", &ch.ID, map[string]any{
		"channel_type": ch.ChannelType,
		"channel_name": ch.Name,
		"ok":           true,
	})
	writeJSON(w, http.StatusOK, map[string]any{
		"ok":           true,
		"message":      "Test notification sent",
		"channel_id":   ch.ID,
		"channel_type": ch.ChannelType,
		"channel_name": ch.Name,
	})
}

func (h *NotificationsHandler) ListRules(w http.ResponseWriter, r *http.Request) {
	rows, err := store.ListNotificationRules(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]notificationRuleResponse, 0, len(rows))
	for _, rule := range rows {
		out = append(out, toNotificationRuleResponse(rule))
	}
	writeJSON(w, http.StatusOK, map[string]any{"rules": out})
}

func (h *NotificationsHandler) GetRule(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	rule, err := store.GetNotificationRule(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "rule not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toNotificationRuleResponse(rule))
}

func (h *NotificationsHandler) CreateRule(w http.ResponseWriter, r *http.Request) {
	var req createNotificationRuleRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	sev, ok := notify.NormalizeSeverity(req.MinSeverity)
	if req.Name == "" || !ok {
		badRequest(w, r, "invalid_input", "name and valid min_severity required")
		return
	}
	triggers := req.Triggers
	if len(triggers) == 0 {
		triggers = []string{notify.TriggerAlertCreated}
	}
	for _, t := range triggers {
		if !notify.ValidTrigger(t) {
			badRequest(w, r, "invalid_input", "invalid trigger: "+t)
			return
		}
	}
	if req.ChannelIDs == nil {
		req.ChannelIDs = []uuid.UUID{}
	}
	enabled := true
	if req.Enabled != nil {
		enabled = *req.Enabled
	}
	rule, err := store.CreateNotificationRule(r.Context(), h.Pool, store.RuleCreateParams{
		Name:        req.Name,
		Enabled:     enabled,
		MinSeverity: sev,
		Triggers:    triggers,
		ChannelIDs:  req.ChannelIDs,
	})
	if err != nil {
		if isUniqueViolation(err) {
			badRequest(w, r, "conflict", "rule name already exists")
			return
		}
		internalError(w, r)
		return
	}
	h.audit(r, "notification_rule.create", "notification_rule", &rule.ID, map[string]any{
		"name": rule.Name, "min_severity": rule.MinSeverity,
	})
	writeJSON(w, http.StatusCreated, toNotificationRuleResponse(rule))
}

func (h *NotificationsHandler) PatchRule(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	var req patchNotificationRuleRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	upd := store.RuleUpdateParams{
		Name:       req.Name,
		Enabled:    req.Enabled,
		Triggers:   req.Triggers,
		ChannelIDs: req.ChannelIDs,
	}
	if req.MinSeverity != nil {
		sev, ok := notify.NormalizeSeverity(*req.MinSeverity)
		if !ok {
			badRequest(w, r, "invalid_input", "invalid min_severity")
			return
		}
		upd.MinSeverity = &sev
	}
	if req.Triggers != nil {
		for _, t := range req.Triggers {
			if !notify.ValidTrigger(t) {
				badRequest(w, r, "invalid_input", "invalid trigger: "+t)
				return
			}
		}
	}
	rule, err := store.UpdateNotificationRule(r.Context(), h.Pool, id, upd)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "rule not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		if isUniqueViolation(err) {
			badRequest(w, r, "conflict", "rule name already exists")
			return
		}
		internalError(w, r)
		return
	}
	h.audit(r, "notification_rule.update", "notification_rule", &rule.ID, map[string]any{
		"name": rule.Name, "min_severity": rule.MinSeverity,
	})
	writeJSON(w, http.StatusOK, toNotificationRuleResponse(rule))
}

func (h *NotificationsHandler) DeleteRule(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	if err := store.DeleteNotificationRule(r.Context(), h.Pool, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "rule not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	h.audit(r, "notification_rule.delete", "notification_rule", &id, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *NotificationsHandler) audit(r *http.Request, action, entityType string, entityID *uuid.UUID, meta map[string]any) {
	var actor *uuid.UUID
	if p, ok := principal.FromContext(r.Context()); ok {
		actor = &p.UserID
	}
	_ = store.Audit(r.Context(), h.Pool, actor, "user", action, entityType, entityID, meta, parseClientIP(r), r.UserAgent())
}

func toChannelResponse(c store.NotificationChannel) channelResponse {
	cfg := c.Config
	if len(cfg) == 0 {
		cfg = json.RawMessage(`{}`)
	}
	return channelResponse{
		ID:          c.ID,
		Name:        c.Name,
		ChannelType: c.ChannelType,
		Config:      cfg,
		HasSecrets:  c.HasSecrets,
		Enabled:     c.Enabled,
		CreatedAt:   c.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:   c.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func toNotificationRuleResponse(r store.NotificationRule) notificationRuleResponse {
	triggers := r.Triggers
	if triggers == nil {
		triggers = []string{}
	}
	ids := r.ChannelIDs
	if ids == nil {
		ids = []uuid.UUID{}
	}
	return notificationRuleResponse{
		ID:          r.ID,
		Name:        r.Name,
		Enabled:     r.Enabled,
		MinSeverity: r.MinSeverity,
		Triggers:    triggers,
		ChannelIDs:  ids,
		CreatedAt:   r.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:   r.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func secretsFromRequest(req *channelSecretsRequest) notify.ChannelSecrets {
	if req == nil {
		return notify.ChannelSecrets{}
	}
	return notify.ChannelSecrets{
		WebhookURL:   strings.TrimSpace(req.WebhookURL),
		SMTPPassword: req.SMTPPassword,
		Headers:      req.Headers,
	}
}

func validateChannelConfig(channelType string, raw json.RawMessage) error {
	switch channelType {
	case notify.ChannelEmail:
		_, err := notify.ParseEmailConfig(raw)
		return err
	default:
		// discord/slack/webhook: config is optional metadata only
		if len(raw) == 0 {
			return nil
		}
		var m map[string]any
		return json.Unmarshal(raw, &m)
	}
}

func validateChannelSecrets(channelType string, s notify.ChannelSecrets) error {
	switch channelType {
	case notify.ChannelDiscord, notify.ChannelSlack, notify.ChannelWebhook:
		if s.WebhookURL == "" {
			return errors.New("secrets.webhook_url is required")
		}
		if !strings.HasPrefix(strings.ToLower(s.WebhookURL), "https://") && !strings.HasPrefix(strings.ToLower(s.WebhookURL), "http://") {
			return errors.New("secrets.webhook_url must be an http(s) URL")
		}
		return nil
	case notify.ChannelEmail:
		// password optional for open relays in tests/dev; username lives in config
		return nil
	default:
		return errors.New("unknown channel type")
	}
}

func isUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	msg := strings.ToLower(err.Error())
	return strings.Contains(msg, "duplicate key") || strings.Contains(msg, "unique constraint")
}
