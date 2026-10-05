package event

import (
	"encoding/json"
	"strings"
	"testing"
	"time"
)

func TestValidateAndNormalizeAcceptsValid(t *testing.T) {
	now := time.Date(2026, 4, 10, 12, 0, 0, 0, time.UTC)
	ev := CanonicalEvent{
		IngestID:   "abc-1",
		OccurredAt: now,
		Source:     "authlog",
		Category:   "auth",
		Severity:   "MEDIUM",
		Message:    "SSH failed password attempt",
		Fields:     map[string]any{"user": "root"},
	}
	n, rej := ValidateAndNormalize(ev, now)
	if rej != nil {
		t.Fatalf("unexpected reject: %+v", rej)
	}
	if n.Severity != "medium" {
		t.Fatalf("severity %q", n.Severity)
	}
	if n.Fingerprint == "" {
		t.Fatal("expected fingerprint")
	}
}

func TestValidateAndNormalizeRejectsBadSeverity(t *testing.T) {
	now := time.Now().UTC()
	ev := CanonicalEvent{
		IngestID:   "x",
		OccurredAt: now,
		Source:     "authlog",
		Message:    "msg",
		Severity:   "urgent",
	}
	_, rej := ValidateAndNormalize(ev, now)
	if rej == nil || rej.Code != "invalid_severity" {
		t.Fatalf("got %+v", rej)
	}
}

func TestValidateAndNormalizeStripsControlChars(t *testing.T) {
	now := time.Now().UTC()
	ev := CanonicalEvent{
		IngestID:   "x",
		OccurredAt: now,
		Source:     "authlog",
		Message:    "hello\x00world",
	}
	n, rej := ValidateAndNormalize(ev, now)
	if rej != nil {
		t.Fatal(rej)
	}
	if n.Message != "helloworld" {
		t.Fatalf("message %q", n.Message)
	}
}

func TestValidateAndNormalizeRawTooLarge(t *testing.T) {
	now := time.Now().UTC()
	raw, _ := json.Marshal(map[string]string{"blob": strings.Repeat("a", MaxRawBytes)})
	ev := CanonicalEvent{
		IngestID:   "x",
		OccurredAt: now,
		Source:     "authlog",
		Message:    "msg",
		Raw:        raw,
	}
	_, rej := ValidateAndNormalize(ev, now)
	if rej == nil || rej.Code != "raw_too_large" {
		t.Fatalf("got %+v", rej)
	}
}

func TestFingerprintStable(t *testing.T) {
	a := Fingerprint("a", "b", "c")
	b := Fingerprint("a", "b", "c")
	if a != b || len(a) != 32 {
		t.Fatalf("fp %q", a)
	}
}
