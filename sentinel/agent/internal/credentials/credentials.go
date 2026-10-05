package credentials

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	"github.com/google/uuid"
)

const fileMode = 0o600

// StoredCredentials is persisted on disk after enrollment.
type StoredCredentials struct {
	AgentID     uuid.UUID `json:"agent_id"`
	ServerID    uuid.UUID `json:"server_id"`
	AgentToken  string    `json:"agent_token"`
	TokenPrefix string    `json:"token_prefix"`
}

// Load reads credentials from path.
func Load(path string) (StoredCredentials, error) {
	b, err := os.ReadFile(path)
	if err != nil {
		return StoredCredentials{}, err
	}
	var c StoredCredentials
	if err := json.Unmarshal(b, &c); err != nil {
		return StoredCredentials{}, err
	}
	if c.AgentToken == "" || c.AgentID == uuid.Nil {
		return StoredCredentials{}, errors.New("credentials file incomplete")
	}
	return c, nil
}

// Save writes credentials with restrictive permissions.
func Save(path string, c StoredCredentials) error {
	if c.AgentToken == "" {
		return errors.New("refusing to save empty agent token")
	}
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("mkdir credentials dir: %w", err)
	}
	b, err := json.MarshalIndent(c, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, b, fileMode); err != nil {
		return err
	}
	if err := os.Rename(tmp, path); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return nil
}
