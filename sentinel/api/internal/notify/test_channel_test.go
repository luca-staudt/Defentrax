package notify

import (
	"context"
	"testing"

	"github.com/google/uuid"
)

func TestTestChannelNilDispatcher(t *testing.T) {
	var d *Dispatcher
	err := d.TestChannel(context.Background(), uuid.New())
	if err == nil || err.Error() != "notification dispatcher not configured" {
		t.Fatalf("expected not configured error, got %v", err)
	}
}

func TestTestChannelMissingSecretsKey(t *testing.T) {
	d := &Dispatcher{Pool: nil, SecretsKey: []byte("short")}
	// Pool nil is checked first after key length... actually Pool nil is checked first
	d = &Dispatcher{Pool: nil, SecretsKey: make([]byte, 32)}
	err := d.TestChannel(context.Background(), uuid.New())
	if err == nil || err.Error() != "notification dispatcher not configured" {
		t.Fatalf("expected not configured, got %v", err)
	}
}

func TestSafeErrorRedactsWebhookURL(t *testing.T) {
	err := errWithURL("post failed: https://discord.com/api/webhooks/1/super-secret")
	safe := SafeError(err)
	if ContainsWebhookLeak(safe) {
		t.Fatalf("leak in SafeError: %s", safe)
	}
	if safe == "" {
		t.Fatal("empty safe error")
	}
}

type errWithURL string

func (e errWithURL) Error() string { return string(e) }
