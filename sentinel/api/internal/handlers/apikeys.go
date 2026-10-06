package handlers

import (
	"net/http"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// APIKeysHandler manages personal API keys under /api/v1/users/me/api-keys.
type APIKeysHandler struct {
	Pool *pgxpool.Pool
}

type createAPIKeyRequest struct {
	Name string `json:"name"`
}

type apiKeyResponse struct {
	ID        uuid.UUID `json:"id"`
	Name      string    `json:"name"`
	KeyPrefix string    `json:"key_prefix"`
	Key       string    `json:"key,omitempty"`
	CreatedAt string    `json:"created_at"`
}

func (h *APIKeysHandler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	keys, err := store.ListAPIKeys(r.Context(), h.Pool, p.UserID)
	if err != nil {
		internalError(w, r)
		return
	}
	out := make([]apiKeyResponse, 0, len(keys))
	for _, k := range keys {
		out = append(out, apiKeyResponse{
			ID:        k.ID,
			Name:      k.Name,
			KeyPrefix: k.KeyPrefix,
			CreatedAt: k.CreatedAt.UTC().Format(timeRFC3339),
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"api_keys": out})
}

const timeRFC3339 = "2006-01-02T15:04:05Z07:00"

func (h *APIKeysHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req createAPIKeyRequest
	if err := decodeJSON(r, &req); err != nil || req.Name == "" {
		badRequest(w, r, "invalid_input", "name required")
		return
	}
	full, prefix, hash, err := secrets.APIKeyMaterial()
	if err != nil {
		internalError(w, r)
		return
	}
	id, err := store.CreateAPIKey(r.Context(), h.Pool, p.UserID, req.Name, hash, prefix)
	if err != nil {
		internalError(w, r)
		return
	}
	rec, _ := store.ListAPIKeys(r.Context(), h.Pool, p.UserID)
	var created store.APIKeyRecord
	for _, k := range rec {
		if k.ID == id {
			created = k
			break
		}
	}
	writeJSON(w, http.StatusCreated, apiKeyResponse{
		ID:        id,
		Name:      req.Name,
		KeyPrefix: prefix,
		Key:       full,
		CreatedAt: created.CreatedAt.UTC().Format(timeRFC3339),
	})
}

func (h *APIKeysHandler) Revoke(w http.ResponseWriter, r *http.Request, keyID uuid.UUID) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := store.RevokeAPIKey(r.Context(), h.Pool, p.UserID, keyID); err != nil {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "api key not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
