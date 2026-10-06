package notify

import (
	"encoding/json"
	"fmt"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/encrypt"
)

// ChannelSecrets holds sensitive channel credentials. Never serialize into API responses or logs.
type ChannelSecrets struct {
	WebhookURL   string            `json:"webhook_url,omitempty"`
	SMTPPassword string            `json:"smtp_password,omitempty"`
	Headers      map[string]string `json:"headers,omitempty"`
}

// EncryptSecrets encrypts secrets JSON with AES-256-GCM.
func EncryptSecrets(key []byte, s ChannelSecrets) (string, error) {
	if len(key) != 32 {
		return "", fmt.Errorf("secrets encryption key must be 32 bytes")
	}
	b, err := json.Marshal(s)
	if err != nil {
		return "", err
	}
	return encrypt.EncryptAESGCM(key, b)
}

// DecryptSecrets decrypts secrets ciphertext.
func DecryptSecrets(key []byte, ciphertext string) (ChannelSecrets, error) {
	if ciphertext == "" {
		return ChannelSecrets{}, nil
	}
	if len(key) != 32 {
		return ChannelSecrets{}, fmt.Errorf("secrets encryption key must be 32 bytes")
	}
	raw, err := encrypt.DecryptAESGCM(key, ciphertext)
	if err != nil {
		return ChannelSecrets{}, err
	}
	var s ChannelSecrets
	if err := json.Unmarshal(raw, &s); err != nil {
		return ChannelSecrets{}, err
	}
	return s, nil
}

// HasAny reports whether any secret field is set.
func (s ChannelSecrets) HasAny() bool {
	return s.WebhookURL != "" || s.SMTPPassword != "" || len(s.Headers) > 0
}
