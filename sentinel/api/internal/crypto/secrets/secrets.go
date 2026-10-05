package secrets

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"strings"
)

// RandomToken returns a URL-safe random string of nbytes entropy (before encoding).
func RandomToken(nbytes int) (string, error) {
	b := make([]byte, nbytes)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(b), nil
}

// HashToken stores only SHA-256 hex of the token (constant-length, no plaintext in DB).
func HashToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// Prefix returns the first n runes safe for display/lookup (ASCII tokens only).
func Prefix(token string, n int) string {
	if n <= 0 {
		return ""
	}
	if len(token) <= n {
		return token
	}
	return token[:n]
}

// ParseBearer extracts the token from an Authorization header value.
func ParseBearer(h string) (string, bool) {
	h = strings.TrimSpace(h)
	const p = "Bearer "
	if !strings.HasPrefix(h, p) {
		return "", false
	}
	t := strings.TrimSpace(h[len(p):])
	if t == "" {
		return "", false
	}
	return t, true
}

// APIKeyMaterial generates a new API key secret and its public form.
func APIKeyMaterial() (full string, prefix string, hash string, err error) {
	raw, err := RandomToken(32)
	if err != nil {
		return "", "", "", err
	}
	full = fmt.Sprintf("sent_%s", raw)
	prefix = Prefix(full, 12)
	hash = HashToken(full)
	return full, prefix, hash, nil
}
