package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/handlers"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
)

// Server wraps the HTTP server and routing.
type Server struct {
	log  *slog.Logger
	http *http.Server
}

// New constructs the API HTTP server with routes and middleware.
func New(log *slog.Logger, cfg config.Config, pool *pgxpool.Pool, limiter ratelimit.Limiter) *Server {
	rootMux := http.NewServeMux()

	readiness := handlers.Readiness{
		RequireDatabase: cfg.DatabaseURL != "",
		Pool:            pool,
	}

	rootMux.HandleFunc("GET /healthz", handlers.Health)
	rootMux.HandleFunc("GET /readyz", readiness.Ready)
	rootMux.HandleFunc("GET /api/v1", handlers.Version)

	apiMux := http.NewServeMux()
	authH := &handlers.AuthHandler{Pool: pool, Config: cfg, Limiter: limiter}
	usersH := &handlers.UsersHandler{Pool: pool}
	keysH := &handlers.APIKeysHandler{Pool: pool}

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

	apiMux.Handle("GET /api/v1/users", protectPerm(pool, cfg, "users", "read", http.HandlerFunc(usersH.List)))
	apiMux.Handle("POST /api/v1/users", protectPerm(pool, cfg, "users", "write", http.HandlerFunc(usersH.Create)))
	apiMux.Handle("PUT /api/v1/users/{id}/roles", protectPerm(pool, cfg, "users", "write", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid user id", requestID)
			return
		}
		usersH.UpdateRoles(w, r, id)
	})))

	apiMux.Handle("GET /api/v1/users/me/api-keys", protectPerm(pool, cfg, "api_keys", "write", http.HandlerFunc(keysH.List)))
	apiMux.Handle("POST /api/v1/users/me/api-keys", protectPerm(pool, cfg, "api_keys", "write", http.HandlerFunc(keysH.Create)))
	apiMux.Handle("DELETE /api/v1/users/me/api-keys/{id}", protectPerm(pool, cfg, "api_keys", "write", http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id, err := uuid.Parse(r.PathValue("id"))
		if err != nil {
			requestID := middleware.RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_id", "invalid api key id", requestID)
			return
		}
		keysH.Revoke(w, r, id)
	})))

	apiMux.HandleFunc("/api/v1/", apiV1NotFound)

	var apiHandler http.Handler = apiMux
	apiHandler = middleware.Authenticate(pool, cfg.SessionCookieName)(apiHandler)
	rootMux.Handle("/api/v1/", apiHandler)

	rootMux.HandleFunc("/", rootNotFound)

	handler := middleware.RequestID(rootMux)
	handler = loggingMiddleware(log, handler)

	addr := fmt.Sprintf(":%d", cfg.Port)
	return &Server{
		log: log,
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
	h = middleware.RequirePermission(resource, action)(h)
	h = middleware.RequireAuth(h)
	return h
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

// Handler returns the root HTTP handler (for tests).
func (s *Server) Handler() http.Handler {
	return s.http.Handler
}

// ListenAndServe starts the HTTP server.
func (s *Server) ListenAndServe() error {
	s.log.Info("starting http server", "addr", s.http.Addr)
	return s.http.ListenAndServe()
}

// Shutdown gracefully stops the server.
func (s *Server) Shutdown(ctx context.Context) error {
	s.log.Info("shutting down http server")
	return s.http.Shutdown(ctx)
}
