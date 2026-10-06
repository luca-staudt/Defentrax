package handlers

import (
	"errors"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// RolesHandler serves /api/v1/roles and /api/v1/permissions.
type RolesHandler struct {
	Pool *pgxpool.Pool
}

type createRoleRequest struct {
	Name        string   `json:"name"`
	Description string   `json:"description"`
	Permissions []string `json:"permissions"`
}

type updateRoleRequest struct {
	Name        *string `json:"name"`
	Description *string `json:"description"`
}

type setRolePermissionsRequest struct {
	Permissions []string `json:"permissions"`
}

func (h *RolesHandler) ListRoles(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	roles, err := store.ListRoles(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	if roles == nil {
		roles = []store.Role{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"roles": roles})
}

func (h *RolesHandler) GetRole(w http.ResponseWriter, r *http.Request, roleID uuid.UUID) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	role, err := store.GetRoleByID(r.Context(), h.Pool, roleID)
	if errors.Is(err, store.ErrNotFound) {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "role not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, role)
}

func (h *RolesHandler) CreateRole(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	var req createRoleRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	name := strings.TrimSpace(req.Name)
	if name == "" {
		badRequest(w, r, "invalid_input", "name required")
		return
	}
	// Normalize custom role names to uppercase snake-ish identifiers.
	name = strings.ToUpper(strings.ReplaceAll(name, " ", "_"))
	id, err := store.CreateRole(r.Context(), h.Pool, name, strings.TrimSpace(req.Description))
	if err != nil {
		badRequest(w, r, "create_failed", "could not create role (name may already exist)")
		return
	}
	if req.Permissions != nil {
		if err := store.SetRolePermissions(r.Context(), h.Pool, id, req.Permissions); err != nil {
			badRequest(w, r, "invalid_permissions", err.Error())
			return
		}
	}
	p, _ := principal.FromContext(r.Context())
	auditRole(r, h.Pool, p, "role.created", &id, map[string]any{"name": name, "permissions": req.Permissions})
	role, err := store.GetRoleByID(r.Context(), h.Pool, id)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusCreated, role)
}

func (h *RolesHandler) PatchRole(w http.ResponseWriter, r *http.Request, roleID uuid.UUID) {
	if r.Method != http.MethodPatch {
		methodNotAllowed(w, r)
		return
	}
	var req updateRoleRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if req.Name == nil && req.Description == nil {
		badRequest(w, r, "invalid_input", "no fields to update")
		return
	}
	var name *string
	if req.Name != nil {
		n := strings.ToUpper(strings.ReplaceAll(strings.TrimSpace(*req.Name), " ", "_"))
		name = &n
	}
	var desc *string
	if req.Description != nil {
		d := strings.TrimSpace(*req.Description)
		desc = &d
	}
	if err := store.UpdateRole(r.Context(), h.Pool, roleID, name, desc); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "role not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		badRequest(w, r, "update_failed", err.Error())
		return
	}
	p, _ := principal.FromContext(r.Context())
	meta := map[string]any{}
	if name != nil {
		meta["name"] = *name
	}
	if desc != nil {
		meta["description"] = *desc
	}
	auditRole(r, h.Pool, p, "role.updated", &roleID, meta)
	role, err := store.GetRoleByID(r.Context(), h.Pool, roleID)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, role)
}

func (h *RolesHandler) DeleteRole(w http.ResponseWriter, r *http.Request, roleID uuid.UUID) {
	if r.Method != http.MethodDelete {
		methodNotAllowed(w, r)
		return
	}
	role, err := store.GetRoleByID(r.Context(), h.Pool, roleID)
	if errors.Is(err, store.ErrNotFound) {
		apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "role not found", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err != nil {
		internalError(w, r)
		return
	}
	if err := store.DeleteRole(r.Context(), h.Pool, roleID); err != nil {
		badRequest(w, r, "delete_failed", err.Error())
		return
	}
	p, _ := principal.FromContext(r.Context())
	auditRole(r, h.Pool, p, "role.deleted", &roleID, map[string]any{"name": role.Name})
	w.WriteHeader(http.StatusNoContent)
}

func (h *RolesHandler) SetPermissions(w http.ResponseWriter, r *http.Request, roleID uuid.UUID) {
	if r.Method != http.MethodPut {
		methodNotAllowed(w, r)
		return
	}
	var req setRolePermissionsRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if req.Permissions == nil {
		req.Permissions = []string{}
	}
	prev, _ := store.ListRolePermissionKeys(r.Context(), h.Pool, roleID)
	if err := store.SetRolePermissions(r.Context(), h.Pool, roleID, req.Permissions); err != nil {
		if errors.Is(err, store.ErrNotFound) {
			apperrors.WriteJSON(w, http.StatusNotFound, "not_found", "role not found", middleware.RequestIDFromContext(r.Context()))
			return
		}
		badRequest(w, r, "invalid_permissions", err.Error())
		return
	}
	p, _ := principal.FromContext(r.Context())
	auditRole(r, h.Pool, p, "role.permissions_changed", &roleID, map[string]any{
		"permissions":          req.Permissions,
		"previous_permissions": prev,
	})
	role, err := store.GetRoleByID(r.Context(), h.Pool, roleID)
	if err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, role)
}

func (h *RolesHandler) ListPermissions(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	perms, err := store.ListPermissions(r.Context(), h.Pool)
	if err != nil {
		internalError(w, r)
		return
	}
	if perms == nil {
		perms = []store.Permission{}
	}
	writeJSON(w, http.StatusOK, map[string]any{"permissions": perms})
}

func auditRole(r *http.Request, pool *pgxpool.Pool, actor *principal.Principal, action string, entityID *uuid.UUID, meta map[string]any) {
	var actorID *uuid.UUID
	if actor != nil {
		actorID = &actor.UserID
	}
	_ = store.Audit(r.Context(), pool, actorID, "user", action, "role", entityID, meta, nil, r.UserAgent())
}
