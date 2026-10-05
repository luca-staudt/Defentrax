package loader

import (
	"crypto/ed25519"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"github.com/luca-staudt/Sentinel/sentinel/plugins/sdk"
)

// Policy controls which plugin manifests may be admitted.
//
// Security model (honest):
//   - Path confinement: manifests must live under RootDir (no traversal).
//   - Allowlist: only slugs in Allowlist may load (empty = load none).
//   - Checksum: SHA-256 over declared artifacts must match manifest.
//   - Optional signature: Ed25519 over the 32-byte digest when RequireSignature.
//
// This is NOT an OS sandbox. Admitted plugins run in-process via registered
// Go factories and share the host address space. See docs/plugins.md.
type Policy struct {
	RootDir          string
	Allowlist        map[string]struct{}
	RequireSignature bool
	TrustedPublicKey ed25519.PublicKey // nil when signatures not used
}

// ParseAllowlist builds a set from a comma-separated slug list.
func ParseAllowlist(csv string) map[string]struct{} {
	out := make(map[string]struct{})
	for _, part := range strings.Split(csv, ",") {
		s := strings.TrimSpace(part)
		if s == "" {
			continue
		}
		out[s] = struct{}{}
	}
	return out
}

// VerifyManifest checks path, allowlist, checksum, and optional signature.
func (p Policy) VerifyManifest(dir string, m sdk.Manifest) error {
	root, err := filepath.Abs(p.RootDir)
	if err != nil {
		return fmt.Errorf("plugin root: %w", err)
	}
	absDir, err := filepath.Abs(dir)
	if err != nil {
		return fmt.Errorf("plugin dir: %w", err)
	}
	rel, err := filepath.Rel(root, absDir)
	if err != nil || strings.HasPrefix(rel, "..") {
		return fmt.Errorf("plugin %q: directory outside plugin root", m.Slug)
	}

	if len(p.Allowlist) == 0 {
		return fmt.Errorf("plugin %q: rejected (empty allowlist; set SENTINEL_PLUGIN_ALLOWLIST)", m.Slug)
	}
	if _, ok := p.Allowlist[m.Slug]; !ok {
		return fmt.Errorf("plugin %q: not in allowlist", m.Slug)
	}

	sum, dig, err := ChecksumArtifacts(absDir, m.Artifacts)
	if err != nil {
		return fmt.Errorf("plugin %q: checksum: %w", m.Slug, err)
	}
	if !strings.EqualFold(sum, m.ChecksumSHA256) {
		return fmt.Errorf("plugin %q: checksum mismatch (got %s, want %s)", m.Slug, sum, m.ChecksumSHA256)
	}

	if p.RequireSignature {
		if len(p.TrustedPublicKey) != ed25519.PublicKeySize {
			return fmt.Errorf("plugin %q: signature required but trusted public key not configured", m.Slug)
		}
		if strings.TrimSpace(m.Signature) == "" {
			return fmt.Errorf("plugin %q: signature required", m.Slug)
		}
		sig, err := base64.StdEncoding.DecodeString(m.Signature)
		if err != nil {
			return fmt.Errorf("plugin %q: invalid signature encoding: %w", m.Slug, err)
		}
		if !ed25519.Verify(p.TrustedPublicKey, dig, sig) {
			return fmt.Errorf("plugin %q: signature verification failed", m.Slug)
		}
	} else if strings.TrimSpace(m.Signature) != "" && len(p.TrustedPublicKey) == ed25519.PublicKeySize {
		// If a signature is present and we have a key, always verify it.
		sig, err := base64.StdEncoding.DecodeString(m.Signature)
		if err != nil {
			return fmt.Errorf("plugin %q: invalid signature encoding: %w", m.Slug, err)
		}
		if !ed25519.Verify(p.TrustedPublicKey, dig, sig) {
			return fmt.Errorf("plugin %q: signature verification failed", m.Slug)
		}
	}

	return nil
}

// ChecksumArtifacts computes a canonical SHA-256 hex digest over artifacts.
// Format: for each artifact path (sorted): "path\n" + file bytes + "\n".
// Returns hex string and raw 32-byte digest.
func ChecksumArtifacts(dir string, artifacts []string) (hexSum string, digest []byte, err error) {
	sorted := append([]string(nil), artifacts...)
	sort.Strings(sorted)
	h := sha256.New()
	for _, a := range sorted {
		if strings.Contains(a, "..") || filepath.IsAbs(a) {
			return "", nil, fmt.Errorf("invalid artifact %q", a)
		}
		path := filepath.Join(dir, filepath.Clean(a))
		// Ensure still under dir after clean.
		rel, err := filepath.Rel(dir, path)
		if err != nil || strings.HasPrefix(rel, "..") {
			return "", nil, fmt.Errorf("artifact escapes plugin dir: %q", a)
		}
		f, err := os.Open(path)
		if err != nil {
			return "", nil, err
		}
		if _, err := io.WriteString(h, a+"\n"); err != nil {
			_ = f.Close()
			return "", nil, err
		}
		if _, err := io.Copy(h, f); err != nil {
			_ = f.Close()
			return "", nil, err
		}
		_ = f.Close()
		if _, err := io.WriteString(h, "\n"); err != nil {
			return "", nil, err
		}
	}
	sum := h.Sum(nil)
	return hex.EncodeToString(sum), sum, nil
}

// ParsePublicKey decodes a base64-encoded Ed25519 public key (32 bytes).
func ParsePublicKey(b64 string) (ed25519.PublicKey, error) {
	b64 = strings.TrimSpace(b64)
	if b64 == "" {
		return nil, nil
	}
	raw, err := base64.StdEncoding.DecodeString(b64)
	if err != nil {
		return nil, fmt.Errorf("PLUGIN_TRUSTED_PUBLIC_KEY: %w", err)
	}
	if len(raw) != ed25519.PublicKeySize {
		return nil, fmt.Errorf("PLUGIN_TRUSTED_PUBLIC_KEY: want %d bytes, got %d", ed25519.PublicKeySize, len(raw))
	}
	return ed25519.PublicKey(raw), nil
}
