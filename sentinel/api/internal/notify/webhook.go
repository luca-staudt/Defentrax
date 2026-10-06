package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// HTTPClient is the subset of http.Client used by webhook senders (mockable).
type HTTPClient interface {
	Do(req *http.Request) (*http.Response, error)
}

// WebhookSender posts JSON to Discord, Slack, or generic webhook URLs.
type WebhookSender struct {
	Client  HTTPClient
	Timeout time.Duration
}

func (s *WebhookSender) client() HTTPClient {
	if s.Client != nil {
		return s.Client
	}
	return &http.Client{Timeout: s.timeout()}
}

func (s *WebhookSender) timeout() time.Duration {
	if s.Timeout > 0 {
		return s.Timeout
	}
	return 10 * time.Second
}

// SendDiscord posts a Discord webhook payload. The webhook URL must never be logged.
func (s *WebhookSender) SendDiscord(ctx context.Context, webhookURL string, ev AlertEvent) error {
	if webhookURL == "" {
		return fmt.Errorf("discord webhook_url is required")
	}
	return s.postJSON(ctx, webhookURL, nil, RenderDiscordJSON(ev))
}

// SendSlack posts a Slack incoming webhook payload.
func (s *WebhookSender) SendSlack(ctx context.Context, webhookURL string, ev AlertEvent) error {
	if webhookURL == "" {
		return fmt.Errorf("slack webhook_url is required")
	}
	return s.postJSON(ctx, webhookURL, nil, RenderSlackJSON(ev))
}

// SendGeneric posts a generic webhook with optional secret headers.
func (s *WebhookSender) SendGeneric(ctx context.Context, webhookURL string, headers map[string]string, ev AlertEvent) error {
	if webhookURL == "" {
		return fmt.Errorf("webhook url is required")
	}
	return s.postJSON(ctx, webhookURL, headers, RenderWebhookJSON(ev))
}

func (s *WebhookSender) postJSON(ctx context.Context, webhookURL string, headers map[string]string, body any) error {
	raw, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, webhookURL, bytes.NewReader(raw))
	if err != nil {
		return fmt.Errorf("build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", "Sentinel-Notifier/1.0")
	for k, v := range headers {
		if k == "" {
			continue
		}
		req.Header.Set(k, v)
	}
	res, err := s.client().Do(req)
	if err != nil {
		return fmt.Errorf("webhook request failed: %s", SafeError(err))
	}
	defer func() { _ = res.Body.Close() }()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 4096))
	if res.StatusCode < 200 || res.StatusCode >= 300 {
		return fmt.Errorf("webhook returned status %d", res.StatusCode)
	}
	return nil
}
