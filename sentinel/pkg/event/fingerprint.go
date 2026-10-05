package event

import (
	"crypto/sha256"
	"encoding/hex"
	"strings"
)

// Fingerprint derives a stable deduplication key from ordered parts (SHA-256, first 16 bytes hex).
func Fingerprint(parts ...string) string {
	h := sha256.Sum256([]byte(strings.Join(parts, "|")))
	return hex.EncodeToString(h[:16])
}
