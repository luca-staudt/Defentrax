package server

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
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
func New(log *slog.Logger, cfg config.Config, pool *pgxpool.Pool) *Server {
	mux := http.NewServeMux()

	readiness := handlers.Readiness{
		RequireDatabase: cfg.DatabaseURL != "",
		Pool:            pool,
	}

	mux.HandleFunc("GET /healthz", handlers.Health)
	mux.HandleFunc("GET /readyz", readiness.Ready)
	mux.HandleFunc("GET /api/v1", handlers.Version)

	// Placeholder for future /api/v1/* routes; unknown paths return standard error JSON.
	mux.HandleFunc("/api/v1/", apiV1NotFound)

	mux.HandleFunc("/", rootNotFound)

	handler := middleware.RequestID(mux)
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
