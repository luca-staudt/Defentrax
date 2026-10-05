package authlog

import (
	"testing"
	"time"
)

func TestParseLine_FailedPassword(t *testing.T) {
	line := `Apr 10 22:22:22 prod-web sshd[12345]: Failed password for root from 203.0.113.10 port 22 ssh2`
	ev, ok := ParseLine(line, "prod-web", time.Date(2026, 4, 10, 22, 22, 22, 0, time.UTC))
	if !ok {
		t.Fatal("expected match")
	}
	if ev.Source != "authlog" || ev.Category != "auth" {
		t.Fatalf("unexpected source/category: %s / %s", ev.Source, ev.Category)
	}
	if ev.Fields["user"] != "root" || ev.Fields["src_ip"] != "203.0.113.10" {
		t.Fatalf("fields: %#v", ev.Fields)
	}
	if ev.Message != "SSH failed password attempt" {
		t.Fatalf("message: %s", ev.Message)
	}
}

func TestParseLine_AcceptedPublicKey(t *testing.T) {
	line := `Apr 10 22:23:01 prod-web sshd[12346]: Accepted publickey for deploy from 198.51.100.5 port 44102 ssh2`
	ev, ok := ParseLine(line, "prod-web", time.Now())
	if !ok {
		t.Fatal("expected match")
	}
	if ev.Fields["method"] != "publickey" {
		t.Fatalf("method: %v", ev.Fields["method"])
	}
}

func TestParseLine_Unrecognized(t *testing.T) {
	_, ok := ParseLine("something else entirely", "host", time.Now())
	if ok {
		t.Fatal("expected no match")
	}
}
