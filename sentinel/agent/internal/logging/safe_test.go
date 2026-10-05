package logging

import "testing"

func TestRedactAgentToken(t *testing.T) {
	raw := "enroll failed token=sagt_abcdefghijklmnopqrstuvwxyz123456"
	out := RedactAgentToken(raw)
	if out == raw {
		t.Fatal("expected redaction")
	}
	if contains(out, "sagt_abcdefghijklmnopqrst") {
		t.Fatalf("token leaked in output: %s", out)
	}
	if !contains(out, "sagt_<redacted>") {
		t.Fatalf("expected redacted prefix: %s", out)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || len(sub) == 0 || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}
