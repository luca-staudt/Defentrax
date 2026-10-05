package config

import (
	"encoding/base64"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

// Config holds API server settings loaded from the environment.
type Config struct {
	Env         string
	Port        int
	LogLevel    string
	DatabaseURL string

	SessionSecret     []byte
	SessionCookieName string
	SessionTTL        time.Duration
	CookieSecure      bool

	RedisURL string

	TOTPEncryptionKey []byte

	LoginRateLimitMax    int
	LoginRateLimitWindow time.Duration

	IngestRateLimitMax    int
	IngestRateLimitWindow time.Duration
	IngestMaxBatchSize    int
	IngestMaxBodyBytes    int64
	IngestDBTimeout       time.Duration
}

// Load reads configuration from environment variables with secure defaults.
func Load() (Config, error) {
	cfg := Config{
		Env:         strings.TrimSpace(getEnv("APP_ENV", "development")),
		LogLevel:    strings.TrimSpace(getEnv("LOG_LEVEL", "info")),
		DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")),
		SessionCookieName: strings.TrimSpace(getEnv("SESSION_COOKIE_NAME", "sentinel_session")),
		RedisURL:          strings.TrimSpace(os.Getenv("REDIS_URL")),
	}

	portStr := strings.TrimSpace(getEnv("API_PORT", "8080"))
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("invalid API_PORT %q: must be 1-65535", portStr)
	}
	cfg.Port = port

	ttlHours, err := strconv.Atoi(getEnv("SESSION_TTL_HOURS", "24"))
	if err != nil || ttlHours < 1 {
		return Config{}, fmt.Errorf("invalid SESSION_TTL_HOURS")
	}
	cfg.SessionTTL = time.Duration(ttlHours) * time.Hour

	cfg.CookieSecure = cfg.Env != "development"
	if v := strings.TrimSpace(os.Getenv("COOKIE_SECURE")); v != "" {
		cfg.CookieSecure = v == "1" || strings.EqualFold(v, "true")
	}

	cfg.LoginRateLimitMax, err = strconv.Atoi(getEnv("LOGIN_RATE_LIMIT_MAX", "10"))
	if err != nil || cfg.LoginRateLimitMax < 1 {
		return Config{}, fmt.Errorf("invalid LOGIN_RATE_LIMIT_MAX")
	}
	windowSec, err := strconv.Atoi(getEnv("LOGIN_RATE_LIMIT_WINDOW_SEC", "60"))
	if err != nil || windowSec < 1 {
		return Config{}, fmt.Errorf("invalid LOGIN_RATE_LIMIT_WINDOW_SEC")
	}
	cfg.LoginRateLimitWindow = time.Duration(windowSec) * time.Second

	cfg.IngestRateLimitMax, err = strconv.Atoi(getEnv("INGEST_RATE_LIMIT_MAX", "120"))
	if err != nil || cfg.IngestRateLimitMax < 1 {
		return Config{}, fmt.Errorf("invalid INGEST_RATE_LIMIT_MAX")
	}
	ingestWindowSec, err := strconv.Atoi(getEnv("INGEST_RATE_LIMIT_WINDOW_SEC", "60"))
	if err != nil || ingestWindowSec < 1 {
		return Config{}, fmt.Errorf("invalid INGEST_RATE_LIMIT_WINDOW_SEC")
	}
	cfg.IngestRateLimitWindow = time.Duration(ingestWindowSec) * time.Second

	cfg.IngestMaxBatchSize, err = strconv.Atoi(getEnv("INGEST_MAX_BATCH_SIZE", "100"))
	if err != nil || cfg.IngestMaxBatchSize < 1 || cfg.IngestMaxBatchSize > 500 {
		return Config{}, fmt.Errorf("invalid INGEST_MAX_BATCH_SIZE (1-500)")
	}
	ingestBody, err := strconv.ParseInt(getEnv("INGEST_MAX_BODY_BYTES", "4194304"), 10, 64)
	if err != nil || ingestBody < 65536 {
		return Config{}, fmt.Errorf("invalid INGEST_MAX_BODY_BYTES")
	}
	cfg.IngestMaxBodyBytes = ingestBody
	ingestDBSec, err := strconv.Atoi(getEnv("INGEST_DB_TIMEOUT_SEC", "15"))
	if err != nil || ingestDBSec < 1 {
		return Config{}, fmt.Errorf("invalid INGEST_DB_TIMEOUT_SEC")
	}
	cfg.IngestDBTimeout = time.Duration(ingestDBSec) * time.Second

	if cfg.DatabaseURL != "" {
		sec := strings.TrimSpace(os.Getenv("SESSION_SECRET"))
		if sec == "" {
			return Config{}, fmt.Errorf("SESSION_SECRET is required when DATABASE_URL is set")
		}
		decoded, err := base64.StdEncoding.DecodeString(sec)
		if err != nil || len(decoded) < 32 {
			return Config{}, fmt.Errorf("SESSION_SECRET must be base64 encoding at least 32 bytes")
		}
		cfg.SessionSecret = decoded
	}

	if k := strings.TrimSpace(os.Getenv("TOTP_ENCRYPTION_KEY")); k != "" {
		decoded, err := base64.StdEncoding.DecodeString(k)
		if err != nil || len(decoded) != 32 {
			return Config{}, fmt.Errorf("TOTP_ENCRYPTION_KEY must be base64 encoding exactly 32 bytes")
		}
		cfg.TOTPEncryptionKey = decoded
	}

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
