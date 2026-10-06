package handlers

import (
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

type updateRolesRequest struct {
	Roles []string `json:"roles"`
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
		internalError(w, r)
		return
	}
	uid := id
	auditUser(r, h.Pool, p, "user.created", &uid, map[string]any{"email": email, "roles": roles})
	user, _ := store.GetUserByID(r.Context(), h.Pool, id)
	roleList, _ := store.ListUserRoles(r.Context(), h.Pool, id)
	writeJSON(w, http.StatusCreated, store.UserPublic{
		ID:          id,
		Email:       user.Email,
		DisplayName: user.DisplayName,
		IsActive:    user.IsActive,
		Roles:       roleList,
	})
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
	if err := store.SetUserRoles(r.Context(), h.Pool, userID, req.Roles, assignedBy); err != nil {
		internalError(w, r)
		return
	}
	auditUser(r, h.Pool, p, "user.role_changed", &userID, map[string]any{"roles": req.Roles})
	w.WriteHeader(http.StatusNoContent)
}

func auditUser(r *http.Request, pool *pgxpool.Pool, actor *principal.Principal, action string, entityID *uuid.UUID, meta map[string]any) {
	var actorID *uuid.UUID
	if actor != nil {
		actorID = &actor.UserID
	}
	_ = store.Audit(r.Context(), pool, actorID, "user", action, "user", entityID, meta, nil, r.UserAgent())
}
