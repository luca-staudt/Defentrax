package handlers

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// ViewsHandler stores personal alert and event filters.
type ViewsHandler struct {
	Pool *pgxpool.Pool
}

type savedViewResponse struct {
	ID        uuid.UUID       `json:"id"`
	Kind      string          `json:"kind"`
	Name      string          `json:"name"`
	Query     json.RawMessage `json:"query"`
	IsDefault bool            `json:"is_default"`
	CreatedAt string          `json:"created_at"`
	UpdatedAt string          `json:"updated_at"`
}

type savedViewRequest struct {
	Kind      string          `json:"kind"`
	Name      string          `json:"name"`
	Query     json.RawMessage `json:"query"`
	IsDefault bool            `json:"is_default"`
}

func (h *ViewsHandler) List(w http.ResponseWriter, r *http.Request) {
	kind := r.URL.Query().Get("kind")
	owner, ok := viewOwner(w, r, kind)
	if !ok {
		return
	}
	rows, err := store.ListSavedViews(r.Context(), h.Pool, owner, kind)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]savedViewResponse, 0, len(rows))
	for _, row := range rows {
		out = append(out, toSavedView(row))
	}
	writeJSON(w, http.StatusOK, map[string]any{"views": out})
}

func (h *ViewsHandler) Create(w http.ResponseWriter, r *http.Request) {
	var req savedViewRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	owner, ok := viewOwner(w, r, req.Kind)
	if !ok {
		return
	}
	write, err := normalizeView(owner, req)
	if err != nil {
		badRequest(w, r, "invalid_input", err.Error())
		return
	}
	view, err := store.CreateSavedView(r.Context(), h.Pool, write)
	if err != nil {
		if errors.Is(err, store.ErrViewExists) {
			apperrors.WriteJSON(w, http.StatusConflict, "conflict", "a view with this name already exists", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusCreated, toSavedView(view))
}

func (h *ViewsHandler) Update(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	user, ok := principal.FromContext(r.Context())
	if !ok || user == nil {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	existing, err := store.GetSavedView(r.Context(), h.Pool, id, user.UserID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "view not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	if !viewKindAllowed(user, existing.Kind) {
		apperrors.WriteJSON(w, http.StatusForbidden, "forbidden", "missing permission", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req savedViewRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	req.Kind = existing.Kind
	write, err := normalizeView(user.UserID, req)
	if err != nil {
		badRequest(w, r, "invalid_input", err.Error())
		return
	}
	view, err := store.UpdateSavedView(r.Context(), h.Pool, id, write)
	if err != nil {
		if errors.Is(err, store.ErrViewExists) {
			apperrors.WriteJSON(w, http.StatusConflict, "conflict", "a view with this name already exists", middleware.RequestIDFromContext(r.Context()))
			return
		}
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "view not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, toSavedView(view))
}

func (h *ViewsHandler) Delete(w http.ResponseWriter, r *http.Request, id uuid.UUID) {
	user, ok := principal.FromContext(r.Context())
	if !ok || user == nil {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	existing, err := store.GetSavedView(r.Context(), h.Pool, id, user.UserID)
	if err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "view not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	if !viewKindAllowed(user, existing.Kind) {
		apperrors.WriteJSON(w, http.StatusForbidden, "forbidden", "missing permission", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := store.DeleteSavedView(r.Context(), h.Pool, id, user.UserID); err != nil {
		internalError(w, r)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func viewOwner(w http.ResponseWriter, r *http.Request, kind string) (uuid.UUID, bool) {
	user, ok := principal.FromContext(r.Context())
	if !ok || user == nil {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return uuid.Nil, false
	}
	if !viewKindAllowed(user, kind) {
		apperrors.WriteJSON(w, http.StatusForbidden, "forbidden", "missing permission", middleware.RequestIDFromContext(r.Context()))
		return uuid.Nil, false
	}
	return user.UserID, true
}

func viewKindAllowed(user *principal.Principal, kind string) bool {
	switch kind {
	case "alerts":
		return user.HasPermission("alerts", "read") && user.HasPermission("pages", "alerts")
	case "events":
		return user.HasPermission("events", "read") && user.HasPermission("pages", "events")
	default:
		return false
	}
}

func normalizeView(owner uuid.UUID, req savedViewRequest) (store.SavedViewWrite, error) {
	name := strings.TrimSpace(req.Name)
	if req.Kind != "alerts" && req.Kind != "events" {
		return store.SavedViewWrite{}, fmt.Errorf("kind must be alerts or events")
	}
	if name == "" || len(name) > 80 {
		return store.SavedViewWrite{}, fmt.Errorf("name must be 1 to 80 characters")
	}
	query, err := normalizeViewQuery(req.Kind, req.Query)
	if err != nil {
		return store.SavedViewWrite{}, err
	}
	return store.SavedViewWrite{
		OwnerID:   owner,
		Kind:      req.Kind,
		Name:      name,
		Query:     query,
		IsDefault: req.IsDefault,
	}, nil
}

func normalizeViewQuery(kind string, raw json.RawMessage) (json.RawMessage, error) {
	if len(raw) == 0 {
		raw = []byte("{}")
	}
	if len(raw) > 4096 {
		return nil, fmt.Errorf("query is too large")
	}
	var fields map[string]string
	if err := json.Unmarshal(raw, &fields); err != nil {
		return nil, fmt.Errorf("query must be an object of strings")
	}
	allowed := map[string]bool{"q": true, "severity": true, "server_id": true}
	if kind == "alerts" {
		allowed["status"] = true
	} else {
		allowed["source"] = true
		allowed["within"] = true
	}
	clean := map[string]string{}
	for key, value := range fields {
		if !allowed[key] {
			return nil, fmt.Errorf("unknown query field %s", key)
		}
		value = strings.TrimSpace(value)
		if len(value) > 200 {
			return nil, fmt.Errorf("%s is too long", key)
		}
		if err := checkViewField(kind, key, value); err != nil {
			return nil, err
		}
		if value != "" {
			clean[key] = value
		}
	}
	out, err := json.Marshal(clean)
	if err != nil {
		return nil, err
	}
	return out, nil
}

func checkViewField(kind, key, value string) error {
	if value == "" {
		return nil
	}
	switch key {
	case "server_id":
		if _, err := uuid.Parse(value); err != nil {
			return fmt.Errorf("server_id must be a uuid")
		}
	case "status":
		switch value {
		case "ALL", "OPEN", "ACKNOWLEDGED", "INVESTIGATING", "RESOLVED":
		default:
			return fmt.Errorf("invalid status")
		}
	case "severity":
		switch strings.ToLower(value) {
		case "all", "info", "low", "medium", "high", "critical":
		default:
			return fmt.Errorf("invalid severity")
		}
	case "within":
		if kind != "events" {
			return fmt.Errorf("within is only valid for events")
		}
		switch value {
		case "15m", "1h", "24h", "7d":
		default:
			return fmt.Errorf("within must be 15m, 1h, 24h, or 7d")
		}
	}
	return nil
}

func toSavedView(row store.SavedView) savedViewResponse {
	query := row.Query
	if len(query) == 0 {
		query = []byte("{}")
	}
	return savedViewResponse{
		ID:        row.ID,
		Kind:      row.Kind,
		Name:      row.Name,
		Query:     query,
		IsDefault: row.IsDefault,
		CreatedAt: row.CreatedAt.UTC().Format(timeRFC3339),
		UpdatedAt: row.UpdatedAt.UTC().Format(timeRFC3339),
	}
}
