package sessioncookie

import (
	"net/http"
	"time"
)

const defaultName = "sentinel_session"

// Set writes the session cookie.
func Set(w http.ResponseWriter, name, token string, ttl time.Duration, secure bool) {
	if name == "" {
		name = defaultName
	}
	sameSite := http.SameSiteStrictMode
	if !secure {
		sameSite = http.SameSiteLaxMode
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: sameSite,
		MaxAge:   int(ttl.Seconds()),
	})
}

// Clear removes the session cookie.
func Clear(w http.ResponseWriter, name string, secure bool) {
	if name == "" {
		name = defaultName
	}
	http.SetCookie(w, &http.Cookie{
		Name:     name,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		Secure:   secure,
		SameSite: http.SameSiteStrictMode,
		MaxAge:   -1,
	})
}

// Read returns the session token from the request cookie.
func Read(r *http.Request, name string) (string, bool) {
	if name == "" {
		name = defaultName
	}
	c, err := r.Cookie(name)
	if err != nil || c.Value == "" {
		return "", false
	}
	return c.Value, true
}
