package middleware

import (
	"net/http"
	"strings"
)

// CORS adds development-friendly cross-origin headers when allowed origins are configured.
func CORS(allowedOrigins string) func(http.Handler) http.Handler {
	origins := parseOrigins(allowedOrigins)
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if len(origins) == 0 {
				next.ServeHTTP(w, r)
				return
			}
			origin := r.Header.Get("Origin")
			if origin != "" && originAllowed(origins, origin) {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Access-Control-Allow-Credentials", "true")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Request-ID")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
				w.Header().Set("Vary", "Origin")
			}
			if r.Method == http.MethodOptions {
				w.WriteHeader(http.StatusNoContent)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func parseOrigins(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

func originAllowed(allowed []string, origin string) bool {
	for _, a := range allowed {
		if a == "*" || a == origin {
			return true
		}
	}
	return false
}
