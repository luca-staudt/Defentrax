package ai

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/encrypt"
)

// Settings for an OpenAI-compatible chat completions call.
type Settings struct {
	BaseURL string
	Model   string
	APIKey  string
}

// Assessment is a possibility-oriented security review. It never asserts a confirmed attack.
type Assessment struct {
	Summary              string   `json:"summary"`
	PossibleExplanations []string `json:"possible_explanations"`
	SuggestedChecks      []string `json:"suggested_checks"`
	SuggestedActions     []string `json:"suggested_actions"`
	ConfidenceNote       string   `json:"confidence_note"`
	Disclaimer           string   `json:"disclaimer"`
}

const systemPrompt = `You are a defensive security analyst assistant for Defentrax.
Given alert or event context, produce a cautious, possibility-oriented assessment.
Rules:
- Never claim a confirmed attack, breach, or compromise.
- Prefer language like "may indicate", "could be consistent with", "worth verifying".
- Suggest concrete defensive checks and safe next steps only.
- Respond with JSON only matching this schema:
{
  "summary": string,
  "possible_explanations": string[],
  "suggested_checks": string[],
  "suggested_actions": string[],
  "confidence_note": string,
  "disclaimer": string
}`

// EncryptAPIKey encrypts a provider API key for storage.
func EncryptAPIKey(key []byte, apiKey string) (string, error) {
	if len(key) != 32 {
		return "", fmt.Errorf("secrets encryption key must be 32 bytes")
	}
	return encrypt.EncryptAESGCM(key, []byte(apiKey))
}

// DecryptAPIKey decrypts a stored API key.
func DecryptAPIKey(key []byte, ciphertext string) (string, error) {
	if ciphertext == "" {
		return "", nil
	}
	if len(key) != 32 {
		return "", fmt.Errorf("secrets encryption key must be 32 bytes")
	}
	raw, err := encrypt.DecryptAESGCM(key, ciphertext)
	if err != nil {
		return "", err
	}
	return string(raw), nil
}

// Analyze calls an OpenAI-compatible chat completions endpoint.
func Analyze(ctx context.Context, settings Settings, userPrompt string) (Assessment, error) {
	base := strings.TrimRight(strings.TrimSpace(settings.BaseURL), "/")
	if base == "" {
		base = "https://api.openai.com/v1"
	}
	model := strings.TrimSpace(settings.Model)
	if model == "" {
		model = "gpt-4o-mini"
	}
	if strings.TrimSpace(settings.APIKey) == "" {
		return Assessment{}, fmt.Errorf("api key required")
	}

	body, _ := json.Marshal(map[string]any{
		"model": model,
		"messages": []map[string]string{
			{"role": "system", "content": systemPrompt},
			{"role": "user", "content": userPrompt},
		},
		"temperature":     0.2,
		"response_format": map[string]string{"type": "json_object"},
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, base+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return Assessment{}, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+settings.APIKey)

	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return Assessment{}, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return Assessment{}, fmt.Errorf("provider status %d: %s", resp.StatusCode, truncate(string(respBody), 240))
	}

	var parsed struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}
	if err := json.Unmarshal(respBody, &parsed); err != nil {
		return Assessment{}, err
	}
	if len(parsed.Choices) == 0 {
		return Assessment{}, fmt.Errorf("empty provider response")
	}
	content := strings.TrimSpace(parsed.Choices[0].Message.Content)
	var out Assessment
	if err := json.Unmarshal([]byte(content), &out); err != nil {
		return Assessment{}, fmt.Errorf("parse assessment: %w", err)
	}
	if out.Disclaimer == "" {
		out.Disclaimer = "This is a possibility-oriented assessment, not a confirmed finding."
	}
	return out, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
