package middleware

import (
	"net/http"
	"strings"
)

// SecurityHeaders adds conservative browser-facing response headers for the API.
// HSTS is enabled only when secureCookies is true (TLS termination expected).
func SecurityHeaders(secureCookies bool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			h := w.Header()
			h.Set("X-Content-Type-Options", "nosniff")
			h.Set("X-Frame-Options", "DENY")
			h.Set("Referrer-Policy", "no-referrer")
			h.Set("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()")
			h.Set("Cross-Origin-Opener-Policy", "same-origin")
			h.Set("Cross-Origin-Resource-Policy", "same-site")
			h.Set("Cache-Control", "no-store")
			if isSwaggerUIPath(r.URL.Path) {
				// Swagger UI loads bundle + CSS from unpkg (pinned in openapi/doc.go).
				h.Set("Content-Security-Policy", "default-src 'none'; script-src 'self' https://unpkg.com 'unsafe-inline'; style-src 'self' https://unpkg.com 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'")
			} else {
				h.Set("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'; base-uri 'none'")
			}
			if secureCookies {
				h.Set("Strict-Transport-Security", "max-age=31536000; includeSubDomains")
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isSwaggerUIPath(path string) bool {
	return path == "/api/v1/docs" || strings.HasPrefix(path, "/api/v1/docs/")
}
