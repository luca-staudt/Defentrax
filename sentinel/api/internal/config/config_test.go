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
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "postgres://localhost:5432/sentinel?sslmode=disable")
	t.Setenv("SESSION_SECRET", "YWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWE=")
	t.Setenv("TOTP_ENCRYPTION_KEY", "YmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmJiYmI=")
	t.Setenv("SECRETS_ENCRYPTION_KEY", "")
	t.Setenv("API_TLS_CERT_FILE", "")
	t.Setenv("API_TLS_KEY_FILE", "")
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
	if len(cfg.SecretsEncryptionKey) != 32 {
		t.Fatal("secrets key should fall back to TOTP key")
	}
	if cfg.NotifyMaxAttempts != 5 {
		t.Fatalf("default max attempts=%d", cfg.NotifyMaxAttempts)
	}
}

func TestLoadRejectsInsecureProductionCookies(t *testing.T) {
	t.Setenv("APP_ENV", "production")
	t.Setenv("COOKIE_SECURE", "false")
	t.Setenv("ALLOW_INSECURE_COOKIES", "")
	t.Setenv("DATABASE_URL", "")
	_, err := Load()
	if err == nil {
		t.Fatal("expected error for insecure cookies in production")
	}
}

func TestLoadAcceptsTLSPair(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("COOKIE_SECURE", "true")
	t.Setenv("API_TLS_CERT_FILE", "/tmp/cert.pem")
	t.Setenv("API_TLS_KEY_FILE", "/tmp/key.pem")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.TLSCertFile == "" || cfg.TLSKeyFile == "" {
		t.Fatal("expected TLS files")
	}
}

func TestLoadRejectsPartialTLS(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("API_TLS_CERT_FILE", "/tmp/cert.pem")
	t.Setenv("API_TLS_KEY_FILE", "")
	_, err := Load()
	if err == nil {
		t.Fatal("expected error for partial TLS config")
	}
}

func TestLoadEnrollRateLimitDefaults(t *testing.T) {
	t.Setenv("APP_ENV", "development")
	t.Setenv("DATABASE_URL", "")
	t.Setenv("API_TLS_CERT_FILE", "")
	t.Setenv("API_TLS_KEY_FILE", "")
	t.Setenv("COOKIE_SECURE", "")
	cfg, err := Load()
	if err != nil {
		t.Fatal(err)
	}
	if cfg.EnrollRateLimitMax != 30 {
		t.Fatalf("enroll max=%d", cfg.EnrollRateLimitMax)
	}
}
