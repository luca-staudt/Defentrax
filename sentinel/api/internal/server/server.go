package server

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/config"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/detectionrun"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/handlers"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/notify"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/pluginruntime"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/realtime"
	"github.com/luca-staudt/Defentrax/sentinel/api/openapi"
)

// Server wraps the HTTP server and routing.
type Server struct {
	log  *slog.Logger
	cfg  config.Config
	http *http.Server
}

// Options configures optional detection and realtime wiring.
type Options struct {
	Detection  *detectionrun.Service
	AlertHub   *realtime.Hub
	Notifier   *notify.Dispatcher
	SecretsKey []byte
	Plugins    *pluginruntime.Runtime
}

// New constructs the API HTTP server with routes and middleware.
func New(log *slog.Logger, cfg config.Config, pool *pgxpool.Pool, loginLimiter, ingestLimiter, enrollLimiter ratelimit.Limiter) *Server {
	return NewWithOptions(log, cfg, pool, loginLimiter, ingestLimiter, enrollLimiter, Options{})
}

// NewWithOptions constructs the API HTTP server with optional detection integration.
func NewWithOptions(log *slog.Logger, cfg config.Config, pool *pgxpool.Pool, loginLimiter, ingestLimiter, enrollLimiter ratelimit.Limiter, opts Options) *Server {
	rootMux := http.NewServeMux()

	readiness := handlers.Readiness{
		RequireDatabase: cfg.DatabaseURL != "",
		Pool:            pool,
	}

	rootMux.HandleFunc("GET /healthz", handlers.Health)
	rootMux.HandleFunc("GET /readyz", readiness.Ready)
	rootMux.HandleFunc("GET /api/v1", handlers.Version)
	// OpenAPI artifacts are public and do not require a database.
	rootMux.HandleFunc("GET /api/v1/openapi.yaml", openapi.Spec)
	rootMux.HandleFunc("GET /api/v1/docs", openapi.UI)
	rootMux.HandleFunc("GET /api/v1/docs/", openapi.UI)

	apiMux := http.NewServeMux()
	authH := &handlers.AuthHandler{Pool: pool, Config: cfg, Limiter: loginLimiter}
	usersH := &handlers.UsersHandler{Pool: pool}
	rolesH := &handlers.RolesHandler{Pool: pool}
	keysH := &handlers.APIKeysHandler{Pool: pool}
	serversH := &handlers.ServersHandler{Pool: pool}
	viewsH := &handlers.ViewsHandler{Pool: pool}
	agentH := &handlers.AgentHandler{Pool: pool, Config: cfg, IngestLimiter: ingestLimiter, EnrollLimiter: enrollLimiter}
	rulesH := &handlers.RulesHandler{Pool: pool}
	alertsH := &handlers.AlertsHandler{Pool: pool, Hub: opts.AlertHub, Notifier: opts.Notifier}
	eventsH := &handlers.EventsHandler{Pool: pool}
	dashboardH := &handlers.DashboardHandler{Pool: pool}
	realtimeH := &handlers.RealtimeHandler{Pool: pool, Config: cfg, Hub: opts.AlertHub}
	notifH := &handlers.NotificationsHandler{Pool: pool, SecretsKey: opts.SecretsKey, Dispatcher: opts.Notifier}
	if len(notifH.SecretsKey) == 0 {
		notifH.SecretsKey = cfg.SecretsEncryptionKey
	}
	pluginsH := &handlers.PluginsHandler{Pool: pool, Runtime: opts.Plugins}
	auditH := &handlers.AuditHandler{Pool: pool}
	if opts.Detection != nil && opts.Detection.Runner != nil {
		runner := opts.Detection.Runner
		agentH.OnDetect = func(eventID, serverID, agentID uuid.UUID, occurredAt time.Time, source, category, severity, host, message string, fields []byte) {
			runner.Enqueue(detectionrun.PendingEvent{
				ID:         eventID,
				ServerID:   serverID,
				AgentID:    agentID,
				OccurredAt: occurredAt,
				Source:     source,
				Category:   category,
				Severity:   severity,
				Host:       host,
				Message:    message,
				Fields:     fields,
			})
		}
		svc := opts.Detection
		rulesH.OnRuleChange = func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if err := svc.ReloadEnabled(ctx); err != nil {
				log.Error("reload rule enable flags failed", "error", err)
			}
		}
	}
	agentAuth := middleware.AuthenticateAgent(pool)

	// Public auth endpoints (no session required).
	apiMux.HandleFunc("POST /api/v1/auth/login", authH.Login)
	apiMux.HandleFunc("POST /api/v1/auth/totp/verify", authH.VerifyTOTP)
	apiMux.HandleFunc("POST /api/v1/auth/recovery/verify", authH.VerifyRecovery)

	// Authenticated auth/session endpoints.
	apiMux.Handle("POST /api/v1/auth/logout", protect(pool, cfg, http.HandlerFunc(authH.Logout)))
	apiMux.Handle("GET /api/v1/auth/me", protect(pool, cfg, http.HandlerFunc(authH.Me)))
	apiMux.Handle("POST /api/v1/auth/totp/enroll", protect(pool, cfg, http.HandlerFunc(authH.EnrollTOTP)))
	apiMux.Handle("POST /api/v1/auth/totp/confirm", protect(pool, cfg, http.HandlerFunc(authH.ConfirmTOTP)))
	apiMux.Handle("POST /api/v1/auth/totp/disable", protect(pool, cfg, http.HandlerFunc(authH.DisableTOTP)))

	apiMux.Handle("GET /api/v1/users", protectAll(pool, cfg, [][2]string{{"users", "read"}, {"pages", "team"}}, http.HandlerFunc(usersH.List)))
	apiMux.Handle("POST /api/v1/users", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(usersH.Create)))
	apiMux.Handle("GET /api/v1/users/{id}", protectAll(pool, cfg, [][2]string{{"users", "read"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.Get(w, r, id)
	})))
	apiMux.Handle("PATCH /api/v1/users/{id}", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.Patch(w, r, id)
	})))
	apiMux.Handle("PUT /api/v1/users/{id}/roles", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.UpdateRoles(w, r, id)
	})))
	apiMux.Handle("POST /api/v1/users/{id}/password", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.ResetPassword(w, r, id)
	})))
	apiMux.Handle("POST /api/v1/users/{id}/totp/reset", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.ResetTOTP(w, r, id)
	})))
	apiMux.Handle("GET /api/v1/users/{id}/sessions", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.ListSessions(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/users/{id}/sessions", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.RevokeAllSessions(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/users/{id}/sessions/{sessionId}", protectAll(pool, cfg, [][2]string{{"users", "write"}, {"pages", "team"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		sid, err := uuid.Parse(r.PathValue("sessionId"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid session id", requestID)
			return
		}
		usersH.RevokeSession(w, r, id, sid)
	})))

	apiMux.Handle("GET /api/v1/roles", protectAll(pool, cfg, [][2]string{{"roles", "read"}, {"pages", "roles"}}, http.HandlerFunc(rolesH.ListRoles)))
	apiMux.Handle("POST /api/v1/roles", protectAll(pool, cfg, [][2]string{{"roles", "write"}, {"pages", "roles"}}, http.HandlerFunc(rolesH.CreateRole)))
	apiMux.Handle("GET /api/v1/roles/{id}", protectAll(pool, cfg, [][2]string{{"roles", "read"}, {"pages", "roles"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid role id", requestID)
			return
		}
		rolesH.GetRole(w, r, id)
	})))
	apiMux.Handle("PATCH /api/v1/roles/{id}", protectAll(pool, cfg, [][2]string{{"roles", "write"}, {"pages", "roles"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid role id", requestID)
			return
		}
		rolesH.PatchRole(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/roles/{id}", protectAll(pool, cfg, [][2]string{{"roles", "write"}, {"pages", "roles"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid role id", requestID)
			return
		}
		rolesH.DeleteRole(w, r, id)
	})))
	apiMux.Handle("PUT /api/v1/roles/{id}/permissions", protectAll(pool, cfg, [][2]string{{"roles", "write"}, {"pages", "roles"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid role id", requestID)
			return
		}
		rolesH.SetPermissions(w, r, id)
	})))
	apiMux.Handle("GET /api/v1/permissions", protectAll(pool, cfg, [][2]string{{"roles", "read"}, {"pages", "roles"}}, http.HandlerFunc(rolesH.ListPermissions)))

	apiMux.Handle("GET /api/v1/users/me/api-keys", protectPerm(pool, cfg, "api_keys", "write", http.HandlerFunc(keysH.List)))
	apiMux.Handle("POST /api/v1/users/me/api-keys", protectPerm(pool, cfg, "api_keys", "write", http.HandlerFunc(keysH.Create)))
	apiMux.HandleFunc("POST /api/v1/agent/enroll", agentH.Enroll)
	apiMux.Handle("POST /api/v1/agent/heartbeat", agentAuth(http.HandlerFunc(agentH.Heartbeat)))
	apiMux.Handle("POST /api/v1/agent/events", agentAuth(http.HandlerFunc(agentH.IngestEvents)))

	apiMux.Handle("GET /api/v1/dashboard/stats", protectAll(pool, cfg, [][2]string{{"alerts", "read"}, {"pages", "dashboard"}}, http.HandlerFunc(dashboardH.Stats)))
	apiMux.Handle("GET /api/v1/events", protectAll(pool, cfg, [][2]string{{"events", "read"}, {"pages", "events"}}, http.HandlerFunc(eventsH.List)))
	apiMux.Handle("GET /api/v1/events/{id}", protectAll(pool, cfg, [][2]string{{"events", "read"}, {"pages", "events"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid event id", requestID)
			return
		}
		eventsH.Get(w, r, id)
	})))
	apiMux.Handle("GET /api/v1/ws/alerts", protectAll(pool, cfg, [][2]string{{"alerts", "read"}, {"pages", "alerts"}}, http.HandlerFunc(realtimeH.AlertsWS)))

	apiMux.Handle("GET /api/v1/servers", protectAll(pool, cfg, [][2]string{{"servers", "read"}, {"pages", "servers"}}, http.HandlerFunc(serversH.List)))
	apiMux.Handle("GET /api/v1/servers/{id}", protectAll(pool, cfg, [][2]string{{"servers", "read"}, {"pages", "server_detail"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid server id", requestID)
			return
		}
		serversH.Get(w, r, id)
	})))
	apiMux.Handle("POST /api/v1/servers", protectAll(pool, cfg, [][2]string{{"servers", "write"}, {"pages", "servers"}}, http.HandlerFunc(serversH.Create)))
	apiMux.Handle("POST /api/v1/servers/{id}/silence", protectAll(pool, cfg, [][2]string{{"servers", "write"}, {"pages", "servers"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid server id", requestID)
			return
		}
		serversH.SetSilence(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/servers/{id}/silence", protectAll(pool, cfg, [][2]string{{"servers", "write"}, {"pages", "servers"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid server id", requestID)
			return
		}
		serversH.ClearSilence(w, r, id)
	})))
	apiMux.Handle("POST /api/v1/servers/{id}/enrollment-tokens", protectAll(pool, cfg, [][2]string{{"servers", "write"}, {"pages", "server_detail"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid server id", requestID)
			return
		}
		serversH.CreateEnrollmentToken(w, r, id)
	})))

	apiMux.Handle("DELETE /api/v1/users/me/api-keys/{id}", protectPerm(pool, cfg, "api_keys", "write", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid api key id", requestID)
			return
		}
		keysH.Revoke(w, r, id)
	})))

	apiMux.Handle("GET /api/v1/rules", protectAll(pool, cfg, [][2]string{{"rules", "read"}, {"pages", "rules"}}, http.HandlerFunc(rulesH.List)))
	apiMux.Handle("POST /api/v1/rules", protectAll(pool, cfg, [][2]string{{"rules", "write"}, {"pages", "rules"}}, http.HandlerFunc(rulesH.Create)))
	apiMux.Handle("GET /api/v1/rules/{id}", protectAll(pool, cfg, [][2]string{{"rules", "read"}, {"pages", "rules"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid rule id", requestID)
			return
		}
		rulesH.Get(w, r, id)
	})))
	apiMux.Handle("GET /api/v1/alerts", protectAll(pool, cfg, [][2]string{{"alerts", "read"}, {"pages", "alerts"}}, http.HandlerFunc(alertsH.List)))
	apiMux.Handle("GET /api/v1/alerts/recent-events", protectAll(pool, cfg, [][2]string{{"alerts", "read"}, {"pages", "alerts"}}, http.HandlerFunc(alertsH.RecentEvents)))
	apiMux.Handle("GET /api/v1/alerts/{id}", protectAll(pool, cfg, [][2]string{{"alerts", "read"}, {"pages", "alert_detail"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid alert id", requestID)
			return
		}
		alertsH.Get(w, r, id)
	})))
	apiMux.Handle("PATCH /api/v1/alerts/{id}", protectAll(pool, cfg, [][2]string{{"alerts", "write"}, {"pages", "alert_detail"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid alert id", requestID)
			return
		}
		alertsH.Patch(w, r, id)
	})))

	apiMux.Handle("GET /api/v1/notification-channels", protectAll(pool, cfg, [][2]string{{"notifications", "read"}, {"pages", "notifications"}}, http.HandlerFunc(notifH.ListChannels)))
	apiMux.Handle("POST /api/v1/notification-channels", protectAll(pool, cfg, [][2]string{{"notifications", "write"}, {"pages", "notifications"}}, http.HandlerFunc(notifH.CreateChannel)))
	apiMux.Handle("GET /api/v1/notification-channels/{id}", protectAll(pool, cfg, [][2]string{{"notifications", "read"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid channel id", requestID)
			return
		}
		notifH.GetChannel(w, r, id)
	})))
	apiMux.Handle("PATCH /api/v1/notification-channels/{id}", protectAll(pool, cfg, [][2]string{{"notifications", "write"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid channel id", requestID)
			return
		}
		notifH.PatchChannel(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/notification-channels/{id}", protectAll(pool, cfg, [][2]string{{"notifications", "write"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid channel id", requestID)
			return
		}
		notifH.DeleteChannel(w, r, id)
	})))
	apiMux.Handle("GET /api/v1/notification-channels/{id}/deliveries", protectAll(pool, cfg, [][2]string{{"notifications", "read"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid channel id", requestID)
			return
		}
		notifH.ListDeliveries(w, r, id)
	})))
	apiMux.Handle("POST /api/v1/notification-channels/{id}/test", protectAll(pool, cfg, [][2]string{{"notifications", "write"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid channel id", requestID)
			return
		}
		notifH.TestChannel(w, r, id)
	})))

	apiMux.Handle("GET /api/v1/notification-rules", protectAll(pool, cfg, [][2]string{{"notifications", "read"}, {"pages", "notifications"}}, http.HandlerFunc(notifH.ListRules)))
	apiMux.Handle("POST /api/v1/notification-rules", protectAll(pool, cfg, [][2]string{{"notifications", "write"}, {"pages", "notifications"}}, http.HandlerFunc(notifH.CreateRule)))
	apiMux.Handle("GET /api/v1/notification-rules/{id}", protectAll(pool, cfg, [][2]string{{"notifications", "read"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid rule id", requestID)
			return
		}
		notifH.GetRule(w, r, id)
	})))
	apiMux.Handle("PATCH /api/v1/notification-rules/{id}", protectAll(pool, cfg, [][2]string{{"notifications", "write"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid rule id", requestID)
			return
		}
		notifH.PatchRule(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/notification-rules/{id}", protectAll(pool, cfg, [][2]string{{"notifications", "write"}, {"pages", "notifications"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid rule id", requestID)
			return
		}
		notifH.DeleteRule(w, r, id)
	})))

	apiMux.Handle("POST /api/v1/rules/{id}/silence", protectAll(pool, cfg, [][2]string{{"rules", "write"}, {"pages", "rules"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid rule id", requestID)
			return
		}
		rulesH.SetSilence(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/rules/{id}/silence", protectAll(pool, cfg, [][2]string{{"rules", "write"}, {"pages", "rules"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid rule id", requestID)
			return
		}
		rulesH.ClearSilence(w, r, id)
	})))
	apiMux.Handle("GET /api/v1/saved-views", protect(pool, cfg, http.HandlerFunc(viewsH.List)))
	apiMux.Handle("POST /api/v1/saved-views", protect(pool, cfg, http.HandlerFunc(viewsH.Create)))
	apiMux.Handle("PATCH /api/v1/saved-views/{id}", protect(pool, cfg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid view id", requestID)
			return
		}
		viewsH.Update(w, r, id)
	})))
	apiMux.Handle("DELETE /api/v1/saved-views/{id}", protect(pool, cfg, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid view id", requestID)
			return
		}
		viewsH.Delete(w, r, id)
	})))
	apiMux.Handle("PATCH /api/v1/rules/{id}", protectAll(pool, cfg, [][2]string{{"rules", "write"}, {"pages", "rules"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid rule id", requestID)
			return
		}
		rulesH.Patch(w, r, id)
	})))

	apiMux.Handle("GET /api/v1/audit-logs", protectAll(pool, cfg, [][2]string{{"audit_logs", "read"}, {"pages", "audit"}}, http.HandlerFunc(auditH.List)))
	apiMux.Handle("GET /api/v1/audit-logs/{id}", protectAll(pool, cfg, [][2]string{{"audit_logs", "read"}, {"pages", "audit"}}, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid audit log id", requestID)
			return
		}
		auditH.Get(w, r, id)
	})))

	apiMux.Handle("GET /api/v1/plugins", protectPerm(pool, cfg, "plugins", "read", http.HandlerFunc(pluginsH.List)))
	apiMux.Handle("GET /api/v1/plugins/{id}", protectPerm(pool, cfg, "plugins", "read", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid plugin id", requestID)
			return
		}
		pluginsH.Get(w, r, id)
	})))
	apiMux.Handle("PATCH /api/v1/plugins/{id}", protectPerm(pool, cfg, "plugins", "write", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid plugin id", requestID)
			return
		}
		pluginsH.Patch(w, r, id)
	})))
	apiMux.Handle("GET /api/v1/plugins/{id}/configs", protectPerm(pool, cfg, "plugins", "read", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid plugin id", requestID)
			return
		}
		pluginsH.ListConfigs(w, r, id)
	})))
	apiMux.Handle("PUT /api/v1/plugins/{id}/configs/{key}", protectPerm(pool, cfg, "plugins", "write", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid plugin id", requestID)
			return
		}
		pluginsH.PutConfig(w, r, id, r.PathValue("key"))
	})))
	apiMux.Handle("DELETE /api/v1/plugins/{id}/configs/{key}", protectPerm(pool, cfg, "plugins", "write", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid plugin id", requestID)
			return
		}
		pluginsH.DeleteConfig(w, r, id, r.PathValue("key"))
	})))

	apiMux.HandleFunc("/api/v1/", apiV1NotFound)

	var apiHandler http.Handler = apiMux
	apiHandler = middleware.Authenticate(pool, cfg.SessionCookieName)(apiHandler)
	apiHandler = middleware.OriginGuard(cfg.CORSAllowedOrigins, cfg.SessionCookieName)(apiHandler)
	rootMux.Handle("/api/v1/", apiHandler)

	rootMux.HandleFunc("/", rootNotFound)

	handler := middleware.RequestID(rootMux)
	handler = middleware.SecurityHeaders(cfg.CookieSecure)(handler)
	handler = middleware.CORS(cfg.CORSAllowedOrigins)(handler)
	handler = loggingMiddleware(log, handler)

	addr := fmt.Sprintf(":%d", cfg.Port)
	return &Server{
		log: log,
		cfg: cfg,
		http: &http.Server{
			Addr:              addr,
			Handler:           handler,
			ReadHeaderTimeout: 5 * time.Second,
			ReadTimeout:       30 * time.Second,
			WriteTimeout:      30 * time.Second,
			IdleTimeout:       60 * time.Second,
		},
	}
}

func protect(pool *pgxpool.Pool, cfg config.Config, h http.Handler) http.Handler {
	return middleware.RequireAuth(h)
}

func protectPerm(pool *pgxpool.Pool, cfg config.Config, resource, action string, h http.Handler) http.Handler {
	return protectAll(pool, cfg, [][2]string{{resource, action}}, h)
}

// protectAll requires every resource/action pair. Authentication is the outer check.
func protectAll(pool *pgxpool.Pool, cfg config.Config, pairs [][2]string, h http.Handler) http.Handler {
	for _, pair := range pairs {
		h = middleware.RequirePermission(pair[0], pair[1])(h)
	}
	return middleware.RequireAuth(h)
}

func apiV1NotFound(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodGet && r.URL.Path == "/api/v1/" {
		handlers.Version(w, r)
		return
	}
	requestID := middleware.RequestIDFromContext(r.Context())
	apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "resource not found", requestID)
}

func rootNotFound(w http.ResponseWriter, r *http.Request) {
	if r.URL.Path == "/" {
		requestID := middleware.RequestIDFromContext(r.Context())
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "resource not found", requestID)
		return
	}
	requestID := middleware.RequestIDFromContext(r.Context())
	apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "resource not found", requestID)
}

func loggingMiddleware(log *slog.Logger, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		// Never log Authorization, cookies, or query strings (may contain tokens).
		log.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
			"request_id", middleware.RequestIDFromContext(r.Context()),
		)
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.status = code
	rw.ResponseWriter.WriteHeader(code)
}

// Hijack preserves WebSocket upgrades through the logging wrapper.
func (rw *responseWriter) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	h, ok := rw.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, fmt.Errorf("response writer does not support hijacking")
	}
	return h.Hijack()
}

func (rw *responseWriter) Flush() {
	if f, ok := rw.ResponseWriter.(http.Flusher); ok {
		f.Flush()
	}
}

// Handler returns the root HTTP handler (for tests).
func (s *Server) Handler() http.Handler {
	return s.http.Handler
}

// ListenAndServe starts the HTTP or HTTPS server.
func (s *Server) ListenAndServe() error {
	if s.cfg.TLSCertFile != "" && s.cfg.TLSKeyFile != "" {
		s.log.Info("starting https server", "addr", s.http.Addr, "cert", s.cfg.TLSCertFile)
		return s.http.ListenAndServeTLS(s.cfg.TLSCertFile, s.cfg.TLSKeyFile)
	}
	s.log.Info("starting http server", "addr", s.http.Addr)
	return s.http.ListenAndServe()
}

// Shutdown gracefully stops the server.
func (s *Server) Shutdown(ctx context.Context) error {
	s.log.Info("shutting down http server")
	return s.http.Shutdown(ctx)
}
