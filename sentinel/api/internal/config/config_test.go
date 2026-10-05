package config

import (
	"testing"
)

func TestLoadRequiresSessionSecretWithDatabase(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost:5432/sentinel?sslmode=disable")
	t.Setenv("SESSION_SECRET", "")
	_, err := Load()
	if err == nil {
		t.Fatal("expected error when SESSION_SECRET missing")
	}
}

func TestLoadAcceptsValidSecrets(t *testing.T) {
	t.Setenv("DATABASE_URL", "postgres://localhost:5432/sentinel?sslmode=disable")
	t.Setenv("SESSION_SECRET", "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=")
	t.Setenv("TOTP_ENCRYPTION_KEY", "YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI=")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if len(cfg.SessionSecret) < 32 {
		t.Fatal("session secret too short")
	}
	if len(cfg.TOTPEncryptionKey) != 32 {
		t.Fatal("totp key must be 32 bytes")
	}
}
