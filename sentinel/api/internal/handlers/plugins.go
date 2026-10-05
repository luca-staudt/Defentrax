package handlers

import (
	"encoding/json"
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/pluginruntime"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/plugins/sdk"
)

// PluginsHandler serves plugin list/enable/config endpoints.
type PluginsHandler struct {
	Pool    *pgxpool.Pool
	Runtime *pluginruntime.Runtime
}

type pluginResponse struct {
	ID             uuid.UUID `json:"id"`
	Slug           string    `json:"slug"`
	Name           string    `json:"name"`
	Version        string    `json:"version"`
	Description    string    `json:"description"`
	Kind           string    `json:"kind"`
	APIVersion     int       `json:"api_version"`
	ChecksumSHA256 string    `json:"checksum_sha256"`
	HasSignature   bool      `json:"has_signature"`
	SourcePath     string    `json:"source_path"`
	LoadStatus     string    `json:"load_status"`
	LoadError      string    `json:"load_error,omitempty"`
	Enabled        bool      `json:"enabled"`
	CreatedAt      string    `json:"created_at"`
	UpdatedAt      string    `json:"updated_at"`
}

type pluginConfigResponse struct {
	Key       string          `json:"key"`
	Value     json.RawMessage `json:"value"`
	UpdatedAt string          `json:"updated_at"`
}

func (h *PluginsHandler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := store.ListPlugins(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]pluginResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toPluginResponse(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"plugins": out,
		"support": sdk.V1Support(),
	})
}

func (h *PluginsHandler) Get(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	row, err := store.GetPluginByID(r.Context(), h.Pool, id)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "plugin not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toPluginResponse(row))
}

type patchPluginRequest struct {
	Enabled *bool `json:"enabled"`
}

func (h *PluginsHandler) Patch(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	var req patchPluginRequest
	if err := decodeJSON(r, &req); err != nil || req.Enabled == nil {
		badRequest(w, r, "invalid_input", "enabled field required")
		return
	}
	row, err := store.SetPluginEnabled(r.Context(), h.Pool, id, *req.Enabled)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "plugin not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	if h.Runtime != nil {
		if err := h.Runtime.Reload(r.Context()); err != nil {
			internalError(w, r)
			return
		}
		// Refresh row after reload status updates.
		if refreshed, err := store.GetPluginByID(r.Context(), h.Pool, id); err == nil {
			row = refreshed
		}
	}
	auditPlugin(r, h.Pool, "plugin.enable_changed", row.ID, map[string]any{
		"slug":    row.Slug,
		"enabled": row.Enabled,
	})
	writeJSON(w, http.StatusOK, toPluginResponse(row))
}

func (h *PluginsHandler) ListConfigs(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	if _, err := store.GetPluginByID(r.Context(), h.Pool, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "plugin not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	rows, err := store.ListPluginConfigs(r.Context(), h.Pool, id)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]pluginConfigResponse, 0, len(rows))
	for _, c := range rows {
		out = append(out, pluginConfigResponse{
			Key:       c.ConfigKey,
			Value:     c.ConfigValue,
			UpdatedAt: c.UpdatedAt.UTC().Format(timeRFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"configs": out})
}

type putConfigRequest struct {
	Value json.RawMessage `json:"value"`
}

func (h *PluginsHandler) PutConfig(w http.ResponseWriter, r *http.Request, id uuid.UUID, key string) {
	key = strings.TrimSpace(key)
	if key == "" || len(key) > 128 {
		badRequest(w, r, "invalid_key", "config key required (max 128 chars)")
		return
	}
	if _, err := store.GetPluginByID(r.Context(), h.Pool, id); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "plugin not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	var req putConfigRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if len(req.Value) == 0 {
		badRequest(w, r, "invalid_input", "value required")
		return
	}
	if !json.Valid(req.Value) {
		badRequest(w, r, "invalid_json", "value must be valid JSON")
		return
	}
	row, err := store.UpsertPluginConfig(r.Context(), h.Pool, id, key, req.Value)
	if err != nil {
		internalError(w, r)
		return
	}
	auditPlugin(r, h.Pool, "plugin.config_upsert", id, map[string]any{"key": key})
	writeJSON(w, http.StatusOK, pluginConfigResponse{
		Key:       row.ConfigKey,
		Value:     row.ConfigValue,
		UpdatedAt: row.UpdatedAt.UTC().Format(timeRFC3339),
	})
}

func (h *PluginsHandler) DeleteConfig(w http.ResponseWriter, r *http.Request, id uuid.UUID, key string) {
	key = strings.TrimSpace(key)
	if err := store.DeletePluginConfig(r.Context(), h.Pool, id, key); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "config key not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	auditPlugin(r, h.Pool, "plugin.config_delete", id, map[string]any{"key": key})
	w.WriteHeader(http.StatusNoContent)
}

func toPluginResponse(row store.PluginRow) pluginResponse {
	return pluginResponse{
		ID:             row.ID,
		Slug:           row.Slug,
		Name:           row.Name,
		Version:        row.Version,
		Description:    row.Description,
		Kind:           row.Kind,
		APIVersion:     row.APIVersion,
		ChecksumSHA256: row.ChecksumSHA256,
		HasSignature:   strings.TrimSpace(row.Signature) != "",
		SourcePath:     row.SourcePath,
		LoadStatus:     row.LoadStatus,
		LoadError:      row.LoadError,
		Enabled:        row.Enabled,
		CreatedAt:      row.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt:      row.UpdatedAt.UTC().Format(timeRFC3339),
	}
}

func auditPlugin(r *http.Request, pool *pgxpool.Pool, action string, entityID uuid.UUID, meta map[string]any) {
	var actor *uuid.UUID
	if p, ok := principal.FromContext(r.Context()); ok {
		id := p.UserID
		actor = &id
	}
	ip := net.ParseIP(clientIP(r))
	_ = store.Audit(r.Context(), pool, actor, "user", action, "plugin", &entityID, meta, ip, r.UserAgent())
}
