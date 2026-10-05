package credentials

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/google/uuid"
)

func TestSaveLoadPermissions(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "creds.json")
	c := StoredCredentials{
		AgentID:     uuid.New(),
		ServerID:    uuid.New(),
		AgentToken:  "sagt_testtokenvalue",
		TokenPrefix: "sagt_test",
	}
	if err := Save(path, c); err != nil {
		t.Fatal(err)
	}
	info, err := os.Stat(path)
	if err != nil {
		t.Fatal(err)
	}
	if info.Mode().Perm() != fileMode {
		t.Fatalf("expected mode %o got %o", fileMode, info.Mode().Perm())
	}
	loaded, err := Load(path)
	if err != nil {
		t.Fatal(err)
	}
	if loaded.AgentToken != c.AgentToken {
		t.Fatal("token mismatch")
	}
}
