package middleware

import (
	"net/http"
	"net/url"
	"strings"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
)

// OriginGuard rejects cookie-authenticated mutating requests whose Origin/Referer
// is not in the allowed list. Bearer / API-key clients without Origin are unaffected.
//
// This is defense-in-depth on top of SameSite cookie flags and CORS allowlisting.
// When allowedOrigins is empty, only same-host Origin values are accepted (if present).
func OriginGuard(allowedOrigins string, cookieName string) func(http.Handler) http.Handler {
	allowed := parseOrigins(allowedOrigins)
	if cookieName == "" {
		cookieName = "sentinel_session"
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !isMutating(r.Method) {
				next.ServeHTTP(w, r)
				return
			}
			if !hasSessionCookie(r, cookieName) {
				next.ServeHTTP(w, r)
				return
			}
			// Prefer Authorization bearer over cookie for machine clients that also send cookies.
			if auth := r.Header.Get("Authorization"); strings.HasPrefix(strings.ToLower(auth), "bearer ") {
				next.ServeHTTP(w, r)
				return
			}

			origin := strings.TrimSpace(r.Header.Get("Origin"))
			if origin == "" {
				if ref := strings.TrimSpace(r.Header.Get("Referer")); ref != "" {
					if u, err := url.Parse(ref); err == nil && u.Scheme != "" && u.Host != "" {
						origin = u.Scheme + "://" + u.Host
					}
				}
			}
			if origin == "" {
				// Non-browser clients (curl, scripts) often omit Origin — allow.
				next.ServeHTTP(w, r)
				return
			}
			if !originPermitted(allowed, origin, r.Host) {
				apperrors.WriteJSON(w, http.StatusForbidden, "origin_forbidden", "request origin not allowed", RequestIDFromContext(r.Context()))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isMutating(method string) bool {
	switch method {
	case http.MethodPost, http.MethodPut, http.MethodPatch, http.MethodDelete:
		return true
	default:
		return false
	}
}

func hasSessionCookie(r *http.Request, name string) bool {
	c, err := r.Cookie(name)
	return err == nil && c != nil && c.Value != ""
}

func originPermitted(allowed []string, origin, requestHost string) bool {
	if strings.Contains(origin, "*") {
		return false
	}
	for _, a := range allowed {
		if a == "*" {
			continue // wildcards are never trusted with cookies
		}
		if a == origin {
			return true
		}
	}
	if len(allowed) > 0 {
		return false
	}
	// No CORS allowlist configured: accept only same-host origins.
	u, err := url.Parse(origin)
	if err != nil || u.Host == "" {
		return false
	}
	return strings.EqualFold(u.Host, requestHost)
}
