package config

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/luca-staudt/Sentinel/sentinel/pkg/version"
)

// Config holds agent runtime settings (env + optional file overrides via SENTINEL_AGENT_*).
type Config struct {
	APIBaseURL      string
	TLSSkipVerify   bool
	CredentialPath  string
	EnrollmentToken string
	AgentName       string
	AgentVersion    string
	HeartbeatEvery  time.Duration
	CollectEvery    time.Duration
	AuthLogPath     string
	UseJournald     bool
	DockerEnabled   bool
	DockerSocket    string
}

// Default on-disk path for agent enrollment credentials (not a secret value).
const defaultCredentialPath = "/var/lib/sentinel/agent/credentials.json" // #nosec G101 -- filesystem path, not a credential

// Load reads configuration from environment variables.
func Load() (Config, error) {
	cfg := Config{
		APIBaseURL:      strings.TrimSuffix(strings.TrimSpace(os.Getenv("SENTINEL_API_URL")), "/"),
		CredentialPath:  strings.TrimSpace(os.Getenv("SENTINEL_AGENT_CREDENTIAL_PATH")),
		EnrollmentToken: strings.TrimSpace(os.Getenv("SENTINEL_ENROLLMENT_TOKEN")),
		AgentName:       strings.TrimSpace(os.Getenv("SENTINEL_AGENT_NAME")),
		AgentVersion:    strings.TrimSpace(os.Getenv("SENTINEL_AGENT_VERSION")),
		AuthLogPath:     strings.TrimSpace(os.Getenv("SENTINEL_AUTH_LOG_PATH")),
	}
	if cfg.CredentialPath == "" {
		cfg.CredentialPath = defaultCredentialPath
	}
	if cfg.AgentVersion == "" {
		cfg.AgentVersion = version.String()
	}
	if v := strings.TrimSpace(os.Getenv("SENTINEL_TLS_INSECURE")); v == "1" || strings.EqualFold(v, "true") {
		cfg.TLSSkipVerify = true
	}
	if v := strings.TrimSpace(os.Getenv("SENTINEL_USE_JOURNALD")); v == "1" || strings.EqualFold(v, "true") {
		cfg.UseJournald = true
	}
	if cfg.AuthLogPath == "" {
		cfg.AuthLogPath = "/var/log/auth.log"
	}
	if v := strings.TrimSpace(os.Getenv("SENTINEL_DOCKER_ENABLED")); v == "1" || strings.EqualFold(v, "true") {
		cfg.DockerEnabled = true
	}
	cfg.DockerSocket = strings.TrimSpace(os.Getenv("SENTINEL_DOCKER_SOCKET"))
	if cfg.DockerSocket == "" {
		cfg.DockerSocket = "/var/run/docker.sock"
	}
	cfg.HeartbeatEvery = durationEnv("SENTINEL_HEARTBEAT_INTERVAL", 30*time.Second)
	cfg.CollectEvery = durationEnv("SENTINEL_COLLECT_INTERVAL", 60*time.Second)

	if cfg.APIBaseURL == "" {
		return cfg, errors.New("SENTINEL_API_URL is required")
	}
	return cfg, nil
}

func durationEnv(key string, def time.Duration) time.Duration {
	raw := strings.TrimSpace(os.Getenv(key))
	if raw == "" {
		return def
	}
	if d, err := time.ParseDuration(raw); err == nil {
		return d
	}
	if sec, err := strconv.Atoi(raw); err == nil && sec > 0 {
		return time.Duration(sec) * time.Second
	}
	return def
}

// String returns a log-safe summary (never includes tokens).
func (c Config) String() string {
	return fmt.Sprintf("api=%s tls_insecure=%v cred_path=%s journald=%v auth_log=%s docker=%v docker_socket=%s",
		c.APIBaseURL, c.TLSSkipVerify, c.CredentialPath, c.UseJournald, c.AuthLogPath, c.DockerEnabled, c.DockerSocket)
}
