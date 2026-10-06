package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/gorilla/websocket"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/config"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/realtime"
)

var wsUpgrader = websocket.Upgrader{
	ReadBufferSize:  1024,
	WriteBufferSize: 1024,
	CheckOrigin: func(r *http.Request) bool {
		return true // session auth + dev CORS; tighten via reverse proxy in production
	},
}

// RealtimeHandler upgrades to WebSocket for live alert feed.
type RealtimeHandler struct {
	Pool   *pgxpool.Pool
	Config config.Config
	Hub    *realtime.Hub
}

func (h *RealtimeHandler) AlertsWS(w http.ResponseWriter, r *http.Request) {
	if h.Hub == nil {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "unavailable", "realtime hub not configured", middleware.RequestIDFromContext(r.Context()))
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if !p.HasPermission("alerts", "read") {
		apperrors.WriteJSON(w, http.StatusForbidden, "forbidden", "insufficient permissions", middleware.RequestIDFromContext(r.Context()))
		return
	}

	conn, err := wsUpgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer func() { _ = conn.Close() }()

	ch := h.Hub.Subscribe()
	defer h.Hub.Unsubscribe(ch)

	_ = conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		return conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	})

	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for range ticker.C {
			if err := conn.WriteControl(websocket.PingMessage, []byte("ping"), time.Now().Add(5*time.Second)); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case ev, ok := <-ch:
			if !ok {
				return
			}
			payload, _ := json.Marshal(map[string]any{"type": "alert", "data": ev})
			if err := conn.WriteMessage(websocket.TextMessage, payload); err != nil {
				return
			}
		case <-r.Context().Done():
			return
		}
	}
}
