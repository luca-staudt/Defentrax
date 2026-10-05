package sdk

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

// Manifest is the on-disk plugin.json descriptor.
type Manifest struct {
	Slug           string   `json:"slug"`
	Name           string   `json:"name"`
	Version        string   `json:"version"`
	Description    string   `json:"description"`
	Kind           Kind     `json:"kind"`
	APIVersion     int      `json:"api_version"`
	Artifacts      []string `json:"artifacts"`
	ChecksumSHA256 string   `json:"checksum_sha256"`
	// Signature is optional Ed25519 signature over the raw checksum bytes
	// (32-byte SHA-256 digest), base64-encoded.
	Signature string `json:"signature,omitempty"`
}

// LoadManifest reads and validates plugin.json at path.
func LoadManifest(path string) (Manifest, error) {
	// path is under the configured plugin directory after allowlist checks.
	b, err := os.ReadFile(path) // #nosec G304 -- plugin.json under operator plugin root
	if err != nil {
		return Manifest{}, err
	}
	var m Manifest
	if err := json.Unmarshal(b, &m); err != nil {
		return Manifest{}, fmt.Errorf("parse manifest: %w", err)
	}
	if err := m.Validate(); err != nil {
		return Manifest{}, err
	}
	return m, nil
}

// Validate checks required manifest fields.
func (m Manifest) Validate() error {
	if strings.TrimSpace(m.Slug) == "" {
		return fmt.Errorf("manifest: slug required")
	}
	if strings.ContainsAny(m.Slug, "/\\") || strings.Contains(m.Slug, "..") {
		return fmt.Errorf("manifest: invalid slug %q", m.Slug)
	}
	if strings.TrimSpace(m.Name) == "" {
		return fmt.Errorf("manifest: name required")
	}
	if strings.TrimSpace(m.Version) == "" {
		return fmt.Errorf("manifest: version required")
	}
	if !ValidKind(m.Kind) {
		return fmt.Errorf("manifest: unknown kind %q", m.Kind)
	}
	if m.APIVersion != APIVersion {
		return fmt.Errorf("manifest: api_version %d unsupported (want %d)", m.APIVersion, APIVersion)
	}
	if len(m.Artifacts) == 0 {
		return fmt.Errorf("manifest: artifacts required")
	}
	for _, a := range m.Artifacts {
		if strings.TrimSpace(a) == "" || strings.Contains(a, "..") || strings.HasPrefix(a, "/") {
			return fmt.Errorf("manifest: invalid artifact path %q", a)
		}
	}
	if len(m.ChecksumSHA256) != 64 || !isHex(m.ChecksumSHA256) {
		return fmt.Errorf("manifest: checksum_sha256 must be 64 hex characters")
	}
	return nil
}

func isHex(s string) bool {
	for _, c := range s {
		if (c < '0' || c > '9') && (c < 'a' || c > 'f') && (c < 'A' || c > 'F') {
			return false
		}
	}
	return true
}
