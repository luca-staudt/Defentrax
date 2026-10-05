package middleware

import (
	"context"
	"net/http"
	"strings"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

// Authenticate loads session cookie or API key bearer into request context.
func Authenticate(pool *pgxpool.Pool, cookieName string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if pool == nil {
				requestID := RequestIDFromContext(r.Context())
				apperrors.WriteJSON(w, http.StatusServiceUnavailable, "database_unavailable", "authentication requires database", requestID)
				return
			}

			if authz := r.Header.Get("Authorization"); authz != "" {
				if token, ok := secrets.ParseBearer(authz); ok && strings.HasPrefix(token, "sent_") {
					if p, ok := authenticateAPIKey(r, pool, token); ok {
						next.ServeHTTP(w, r.WithContext(principal.WithContext(r.Context(), p)))
						return
					}
				}
			}

			if token, ok := readSessionToken(r, cookieName); ok {
				hash := secrets.HashToken(token)
				sess, err := store.GetSessionByTokenHash(r.Context(), pool, hash)
				if err == nil {
					user, err := store.GetUserByID(r.Context(), pool, sess.UserID)
					if err == nil && user.IsActive {
						p, err := buildPrincipal(r.Context(), pool, user.ID, user.Email, "session")
						if err == nil {
							p.SessionID = sess.ID
							next.ServeHTTP(w, r.WithContext(principal.WithContext(r.Context(), p)))
							return
						}
					}
				}
			}

			next.ServeHTTP(w, r)
		})
	}
}

func readSessionToken(r *http.Request, cookieName string) (string, bool) {
	if c, err := r.Cookie(cookieName); err == nil && c.Value != "" {
		return c.Value, true
	}
	return "", false
}

func authenticateAPIKey(r *http.Request, pool *pgxpool.Pool, token string) (*principal.Principal, bool) {
	hash := secrets.HashToken(token)
	rec, userID, err := store.LookupAPIKeyByHash(r.Context(), pool, hash)
	if err != nil {
		return nil, false
	}
	user, err := store.GetUserByID(r.Context(), pool, userID)
	if err != nil || !user.IsActive {
		return nil, false
	}
	_ = store.TouchAPIKeyUsed(r.Context(), pool, rec.ID)
	p, err := buildPrincipal(r.Context(), pool, user.ID, user.Email, "api_key")
	if err != nil {
		return nil, false
	}
	p.APIKeyID = rec.ID
	return p, true
}

func buildPrincipal(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, email, method string) (*principal.Principal, error) {
	roles, err := store.ListUserRoles(ctx, pool, userID)
	if err != nil {
		return nil, err
	}
	perms, err := store.ListPermissionsForUser(ctx, pool, userID)
	if err != nil {
		return nil, err
	}
	return &principal.Principal{
		UserID:      userID,
		Email:       email,
		Roles:       roles,
		Permissions: principal.PermissionSet(perms),
		AuthMethod:  method,
	}, nil
}

// RequireAuth rejects unauthenticated requests.
func RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if _, ok := principal.FromContext(r.Context()); !ok {
			requestID := RequestIDFromContext(r.Context())
			apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", requestID)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// RequirePermission enforces RBAC from DB-backed permissions (ADMIN bypass in principal).
func RequirePermission(resource, action string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			p, ok := principal.FromContext(r.Context())
			if !ok {
				requestID := RequestIDFromContext(r.Context())
				apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", requestID)
				return
			}
			if !p.HasPermission(resource, action) {
				requestID := RequestIDFromContext(r.Context())
				apperrors.WriteJSON(w, http.StatusForbidden, "forbidden", "insufficient permissions", requestID)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
