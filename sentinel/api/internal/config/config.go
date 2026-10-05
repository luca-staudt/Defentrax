package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
)

// Config holds API server settings loaded from the environment.
type Config struct {
	Env         string
	Port        int
	LogLevel    string
	DatabaseURL string
}

// Load reads configuration from environment variables with secure defaults.
func Load() (Config, error) {
	cfg := Config{
		Env:         strings.TrimSpace(getEnv("APP_ENV", "development")),
		LogLevel:    strings.TrimSpace(getEnv("LOG_LEVEL", "info")),
		DatabaseURL: strings.TrimSpace(os.Getenv("DATABASE_URL")),
	}

	portStr := strings.TrimSpace(getEnv("API_PORT", "8080"))
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return Config{}, fmt.Errorf("invalid API_PORT %q: must be 1-65535", portStr)
	}
	cfg.Port = port

	return cfg, nil
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
