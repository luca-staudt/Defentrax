package notify

import (
	"strings"
	"testing"
	"time"
)

func TestRedactURLs(t *testing.T) {
	in := `post failed to https://discord.com/api/webhooks/123/abc-SECRET and https://hooks.slack.com/services/T/B/xxx`
	out := RedactURLs(in)
	if strings.Contains(out, "abc-SECRET") || strings.Contains(out, "/123/") {
		t.Fatalf("webhook secret leaked: %s", out)
	}
	if !strings.Contains(out, "discord.com/[redacted]") {
		t.Fatalf("expected redacted discord host path, got %s", out)
	}
	if ContainsWebhookLeak(out) {
		t.Fatalf("ContainsWebhookLeak true after redact: %s", out)
	}
	if !ContainsWebhookLeak(in) {
		t.Fatal("expected leak detection on raw webhook URL")
	}
}

func TestMeetsMin(t *testing.T) {
	cases := []struct {
		alert, min string
		want       bool
	}{
		{"critical", "critical", true},
		{"critical", "high", true},
		{"high", "critical", false},
		{"low", "high", false},
		{"medium", "low", true},
		{"INFO", "info", true},
		{"nope", "high", false},
	}
	for _, tc := range cases {
		if got := MeetsMin(tc.alert, tc.min); got != tc.want {
			t.Fatalf("MeetsMin(%q,%q)=%v want %v", tc.alert, tc.min, got, tc.want)
		}
	}
}

func TestBackoff(t *testing.T) {
	if Backoff(1, 500*time.Millisecond, 30*time.Second) != 500*time.Millisecond {
		t.Fatal("attempt 1")
	}
	if Backoff(2, 500*time.Millisecond, 30*time.Second) != time.Second {
		t.Fatal("attempt 2")
	}
	if Backoff(10, 500*time.Millisecond, 2*time.Second) != 2*time.Second {
		t.Fatal("capped")
	}
}

func TestEncryptDecryptSecrets(t *testing.T) {
	key := []byte("0123456789abcdef0123456789abcdef")
	enc, err := EncryptSecrets(key, ChannelSecrets{WebhookURL: "https://example.com/hook/secret"})
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(enc, "secret") {
		t.Fatal("plaintext in ciphertext encoding")
	}
	dec, err := DecryptSecrets(key, enc)
	if err != nil {
		t.Fatal(err)
	}
	if dec.WebhookURL != "https://example.com/hook/secret" {
		t.Fatalf("got %#v", dec)
	}
}
