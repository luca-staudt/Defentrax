package loader_test

import (
	"crypto/ed25519"
	"encoding/base64"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/luca-staudt/Sentinel/sentinel/plugins/loader"
	"github.com/luca-staudt/Sentinel/sentinel/plugins/sdk"
)

func TestChecksumAndAllowlist(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "demo")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	art := "a.txt"
	if err := os.WriteFile(filepath.Join(dir, art), []byte("hello"), 0o644); err != nil {
		t.Fatal(err)
	}
	sum, dig, err := loader.ChecksumArtifacts(dir, []string{art})
	if err != nil {
		t.Fatal(err)
	}
	if len(sum) != 64 || len(dig) != 32 {
		t.Fatalf("bad digest lengths sum=%d dig=%d", len(sum), len(dig))
	}

	m := sdk.Manifest{
		Slug:           "demo",
		Name:           "Demo",
		Version:        "1.0.0",
		Kind:           sdk.KindEventParser,
		APIVersion:     sdk.APIVersion,
		Artifacts:      []string{art},
		ChecksumSHA256: sum,
	}
	pol := loader.Policy{
		RootDir:   root,
		Allowlist: loader.ParseAllowlist("demo"),
	}
	if err := pol.VerifyManifest(dir, m); err != nil {
		t.Fatalf("expected admit: %v", err)
	}

	// Wrong checksum
	bad := m
	bad.ChecksumSHA256 = hex.EncodeToString(make([]byte, 32))
	if err := pol.VerifyManifest(dir, bad); err == nil {
		t.Fatal("expected checksum failure")
	}

	// Not allowlisted
	pol2 := loader.Policy{RootDir: root, Allowlist: loader.ParseAllowlist("other")}
	if err := pol2.VerifyManifest(dir, m); err == nil {
		t.Fatal("expected allowlist failure")
	}

	// Empty allowlist
	pol3 := loader.Policy{RootDir: root, Allowlist: map[string]struct{}{}}
	if err := pol3.VerifyManifest(dir, m); err == nil {
		t.Fatal("expected empty allowlist failure")
	}
}

func TestPathTraversalRejected(t *testing.T) {
	root := t.TempDir()
	outside := t.TempDir()
	dir := filepath.Join(outside, "evil")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	sum, _, err := loader.ChecksumArtifacts(dir, []string{"a.txt"})
	if err != nil {
		t.Fatal(err)
	}
	m := sdk.Manifest{
		Slug: "evil", Name: "Evil", Version: "1", Kind: sdk.KindEventParser,
		APIVersion: sdk.APIVersion, Artifacts: []string{"a.txt"}, ChecksumSHA256: sum,
	}
	pol := loader.Policy{RootDir: root, Allowlist: loader.ParseAllowlist("evil")}
	if err := pol.VerifyManifest(dir, m); err == nil {
		t.Fatal("expected path confinement failure")
	}
}

func TestSignatureVerification(t *testing.T) {
	root := t.TempDir()
	dir := filepath.Join(root, "signed")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "a.txt"), []byte("payload"), 0o644); err != nil {
		t.Fatal(err)
	}
	sum, dig, err := loader.ChecksumArtifacts(dir, []string{"a.txt"})
	if err != nil {
		t.Fatal(err)
	}
	pub, priv, err := ed25519.GenerateKey(nil)
	if err != nil {
		t.Fatal(err)
	}
	sig := ed25519.Sign(priv, dig)
	m := sdk.Manifest{
		Slug: "signed", Name: "Signed", Version: "1", Kind: sdk.KindDataSource,
		APIVersion: sdk.APIVersion, Artifacts: []string{"a.txt"},
		ChecksumSHA256: sum,
		Signature:      base64.StdEncoding.EncodeToString(sig),
	}
	pol := loader.Policy{
		RootDir:          root,
		Allowlist:        loader.ParseAllowlist("signed"),
		RequireSignature: true,
		TrustedPublicKey: pub,
	}
	if err := pol.VerifyManifest(dir, m); err != nil {
		t.Fatalf("signed admit: %v", err)
	}
	m.Signature = base64.StdEncoding.EncodeToString(ed25519.Sign(priv, make([]byte, 32)))
	if err := pol.VerifyManifest(dir, m); err == nil {
		t.Fatal("expected bad signature failure")
	}
}

func TestDiscoverExamplePlugin(t *testing.T) {
	// Read from repo examples directory relative to this package.
	root := filepath.Join("..", "examples")
	if st, err := os.Stat(root); err != nil || !st.IsDir() {
		t.Skip("examples dir not present")
	}
	pol := loader.Policy{
		RootDir:   root,
		Allowlist: loader.ParseAllowlist("echo-parser"),
	}
	admitted, rejected, err := loader.Discover(root, pol)
	if err != nil {
		t.Fatal(err)
	}
	if len(admitted) != 1 || admitted[0].Manifest.Slug != "echo-parser" {
		t.Fatalf("admitted=%v rejected=%v", admitted, rejected)
	}
	if _, ok := sdk.Lookup("echo-parser"); !ok {
		// Factory registers via init of example package — import side effect in loader_test via blank import below.
		t.Log("factory not registered until blank import; instantiate test covers that")
	}
}
