package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// UsersHandler serves /api/v1/users/* (admin CRUD).
type UsersHandler struct {
	Pool *pgxpool.Pool
}

type createUserRequest struct {
	Email       string   `json:"email"`
	Password    string   `json:"password"`
	DisplayName string   `json:"display_name"`
	Roles       []string `json:"roles"`
}

type updateUserRequest struct {
	DisplayName *string `json:"display_name"`
	IsActive    *bool   `json:"is_active"`
}

type updateRolesRequest struct {
	Roles []string `json:"roles"`
}

type resetPasswordRequest struct {
	Password string `json:"password"`
}

func (h *UsersHandler) List(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	users, err := store.ListUsers(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"users": users})
}

func (h *UsersHandler) Get(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	user, err := store.GetUserPublic(r.Context(), h.Pool, userID)
	if errors.Is(err, store.ErrNotFound) {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "user not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *UsersHandler) Create(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	var req createUserRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" || len(req.Password) < 12 {
		badRequest(w, r, "invalid_input", "email required and password must be at least 12 characters")
		return
	}
	hash, err := password.Hash(req.Password)
	if err != nil {
		internalError(w, r)
		return
	}
	display := strings.TrimSpace(req.DisplayName)
	id, err := store.CreateUser(r.Context(), h.Pool, email, hash, display)
	if err != nil {
		badRequest(w, r, "create_failed", "could not create user")
		return
	}
	roles := req.Roles
	if len(roles) == 0 {
		roles = []string{"VIEWER"}
	}
	p, _ := principal.FromContext(r.Context())
	var assignedBy *uuid.UUID
	if p != nil {
		assignedBy = &p.UserID
	}
	if err := store.SetUserRoles(r.Context(), h.Pool, id, roles, assignedBy); err != nil {
		if store.IsRoleNotFound(err) {
			badRequest(w, r, "invalid_role", err.Error())
			return
		}
		internalError(w, r)
		return
	}
	uid := id
	auditUser(r, h.Pool, p, "user.created", &uid, map[string]any{"email": email, "roles": roles})
	user, err := store.GetUserPublic(r.Context(), h.Pool, id)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusCreated, user)
}

func (h *UsersHandler) Patch(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodPatch {
		methodNotAllowed(w, r)
		return
	}
	var req updateUserRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if req.DisplayName == nil && req.IsActive == nil {
		badRequest(w, r, "invalid_input", "no fields to update")
		return
	}
	if _, err := store.GetUserByID(r.Context(), h.Pool, userID); err != nil {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "user not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	p, _ := principal.FromContext(r.Context())
	// Prevent self-disable lockout.
	if req.IsActive != nil && !*req.IsActive && p != nil && p.UserID == userID {
		badRequest(w, r, "invalid_input", "cannot disable your own account")
		return
	}
	var display *string
	if req.DisplayName != nil {
		trimmed := strings.TrimSpace(*req.DisplayName)
		display = &trimmed
	}
	if err := store.UpdateUser(r.Context(), h.Pool, userID, display, req.IsActive); err != nil {
		internalError(w, r)
		return
	}
	meta := map[string]any{}
	if display != nil {
		meta["display_name"] = *display
	}
	if req.IsActive != nil {
		meta["is_active"] = *req.IsActive
		if !*req.IsActive {
			_, _ = store.DeleteSessionsByUser(r.Context(), h.Pool, userID)
			auditUser(r, h.Pool, p, "user.disabled", &userID, meta)
		} else {
			auditUser(r, h.Pool, p, "user.enabled", &userID, meta)
		}
	} else {
		auditUser(r, h.Pool, p, "user.updated", &userID, meta)
	}
	user, err := store.GetUserPublic(r.Context(), h.Pool, userID)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, user)
}

func (h *UsersHandler) UpdateRoles(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodPut {
		methodNotAllowed(w, r)
		return
	}
	var req updateRolesRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if len(req.Roles) == 0 {
		badRequest(w, r, "invalid_input", "at least one role required")
		return
	}
	if _, err := store.GetUserByID(r.Context(), h.Pool, userID); err != nil {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "user not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	p, _ := principal.FromContext(r.Context())
	var assignedBy *uuid.UUID
	if p != nil {
		assignedBy = &p.UserID
	}
	prev, _ := store.ListUserRoles(r.Context(), h.Pool, userID)
	if err := store.SetUserRoles(r.Context(), h.Pool, userID, req.Roles, assignedBy); err != nil {
		if store.IsRoleNotFound(err) {
			badRequest(w, r, "invalid_role", err.Error())
			return
		}
		internalError(w, r)
		return
	}
	auditUser(r, h.Pool, p, "user.role_changed", &userID, map[string]any{"roles": req.Roles, "previous_roles": prev})
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) ResetPassword(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	var req resetPasswordRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if len(req.Password) < 12 {
		badRequest(w, r, "invalid_input", "password must be at least 12 characters")
		return
	}
	if _, err := store.GetUserByID(r.Context(), h.Pool, userID); err != nil {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "user not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	hash, err := password.Hash(req.Password)
	if err != nil {
		internalError(w, r)
		return
	}
	if err := store.UpdateUserPassword(r.Context(), h.Pool, userID, hash); err != nil {
		internalError(w, r)
		return
	}
	_, _ = store.DeleteSessionsByUser(r.Context(), h.Pool, userID)
	p, _ := principal.FromContext(r.Context())
	auditUser(r, h.Pool, p, "user.password_reset", &userID, map[string]any{"sessions_revoked": true})
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) ResetTOTP(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	if _, err := store.GetUserByID(r.Context(), h.Pool, userID); err != nil {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "user not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := store.DisableTwoFactor(r.Context(), h.Pool, userID); err != nil {
		internalError(w, r)
		return
	}
	p, _ := principal.FromContext(r.Context())
	auditUser(r, h.Pool, p, "auth.totp_admin_reset", &userID, nil)
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) ListSessions(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	if _, err := store.GetUserByID(r.Context(), h.Pool, userID); err != nil {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "user not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	sessions, err := store.ListSessionsByUser(r.Context(), h.Pool, userID)
	if err != nil {
		internalError(w, r)
		return
	}
	p, _ := principal.FromContext(r.Context())
	if p != nil {
		for i := range sessions {
			if sessions[i].ID == p.SessionID {
				sessions[i].Current = true
			}
		}
	}
	if sessions == nil {
		sessions = []store.SessionPublic{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"sessions": sessions})
}

func (h *UsersHandler) RevokeSession(w http.ResponseWriter, r *http.Request, userID, sessionID uuid.UUID) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w, r)
		return
	}
	if err := store.DeleteSessionForUser(r.Context(), h.Pool, userID, sessionID); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "session not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		internalError(w, r)
		return
	}
	p, _ := principal.FromContext(r.Context())
	auditUser(r, h.Pool, p, "user.session_revoked", &userID, map[string]any{"session_id": sessionID.String()})
	w.WriteHeader(http.StatusNoContent)
}

func (h *UsersHandler) RevokeAllSessions(w http.ResponseWriter, r *http.Request, userID uuid.UUID) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w, r)
		return
	}
	if _, err := store.GetUserByID(r.Context(), h.Pool, userID); err != nil {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "user not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	n, err := store.DeleteSessionsByUser(r.Context(), h.Pool, userID)
	if err != nil {
		internalError(w, r)
		return
	}
	p, _ := principal.FromContext(r.Context())
	auditUser(r, h.Pool, p, "user.sessions_revoked", &userID, map[string]any{"count": n})
	w.WriteHeader(http.StatusNoContent)
}

func auditUser(r *http.Request, pool *pgxpool.Pool, actor *principal.Principal, action string, entityID *uuid.UUID, meta map[string]any) {
	var actorID *uuid.UUID
	if actor != nil {
		actorID = &actor.UserID
	}
	_ = store.Audit(r.Context(), pool, actorID, "user", action, "user", entityID, meta, nil, r.UserAgent())
}
