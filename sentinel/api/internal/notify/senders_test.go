package notify

import (
	"bytes"
	"context"
	"io"
	"net/http"
	"net/smtp"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) Do(r *http.Request) (*http.Response, error) { return f(r) }

func TestWebhookSendersMockHTTP(t *testing.T) {
	var mu sync.Mutex
	var urls []string
	var bodies []string
	client := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		mu.Lock()
		defer mu.Unlock()
		urls = append(urls, r.URL.String())
		b, _ := io.ReadAll(r.Body)
		bodies = append(bodies, string(b))
		return &http.Response{StatusCode: 204, Body: io.NopCloser(bytes.NewReader(nil)), Header: make(http.Header)}, nil
	})
	s := &WebhookSender{Client: client}
	ev := AlertEvent{Title: "Possible brute-force", Severity: "high", Status: "OPEN", EventCount: 3}

	secretURL := "https://discord.com/api/webhooks/999/super-secret-token"
	if err := s.SendDiscord(context.Background(), secretURL, ev); err != nil {
		t.Fatal(err)
	}
	if err := s.SendSlack(context.Background(), "https://hooks.slack.com/services/T/B/xxx", ev); err != nil {
		t.Fatal(err)
	}
	if err := s.SendGeneric(context.Background(), "https://example.com/hooks/abc", map[string]string{"X-Token": "t"}, ev); err != nil {
		t.Fatal(err)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(urls) != 3 {
		t.Fatalf("expected 3 posts, got %d", len(urls))
	}
	if !strings.Contains(bodies[0], "Possible brute-force") {
		t.Fatalf("discord body: %s", bodies[0])
	}
}

func TestWebhookSenderFailureStatus(t *testing.T) {
	client := roundTripFunc(func(r *http.Request) (*http.Response, error) {
		return &http.Response{StatusCode: 500, Body: io.NopCloser(bytes.NewReader([]byte("fail"))), Header: make(http.Header)}, nil
	})
	s := &WebhookSender{Client: client}
	err := s.SendDiscord(context.Background(), "https://discord.com/api/webhooks/1/x", AlertEvent{Title: "t", Severity: "high"})
	if err == nil {
		t.Fatal("expected error")
	}
	if ContainsWebhookLeak(err.Error()) {
		t.Fatalf("webhook leaked in error: %v", err)
	}
}

func TestEmailSenderMockSMTP(t *testing.T) {
	var calls atomic.Int32
	var gotTo []string
	var gotMsg string
	sender := &EmailSender{
		Send: func(addr string, a smtp.Auth, from string, to []string, msg []byte) error {
			calls.Add(1)
			gotTo = append([]string{}, to...)
			gotMsg = string(msg)
			if from != "alerts@sentinel.local" {
				t.Fatalf("from=%s", from)
			}
			return nil
		},
	}
	err := sender.SendEmail(context.Background(), EmailConfig{
		SMTPHost: "smtp.test",
		SMTPPort: 587,
		From:     "alerts@sentinel.local",
		To:       []string{"oncall@example.com"},
		Username: "u",
	}, "pw", AlertEvent{Title: "Possible SSH brute-force", Severity: "critical", Status: "OPEN"})
	if err != nil {
		t.Fatal(err)
	}
	if calls.Load() != 1 {
		t.Fatal("smtp not called")
	}
	if gotTo[0] != "oncall@example.com" {
		t.Fatalf("to=%v", gotTo)
	}
	if !strings.Contains(gotMsg, "Possible SSH brute-force") {
		t.Fatalf("msg=%s", gotMsg)
	}
}

func TestBackoffDoubling(t *testing.T) {
	if got := Backoff(3, 10*time.Millisecond, time.Second); got != 40*time.Millisecond {
		t.Fatalf("backoff=%v", got)
	}
}
