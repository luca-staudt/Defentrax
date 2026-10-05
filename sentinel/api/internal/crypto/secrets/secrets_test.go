package secrets

import "testing"

func TestAgentTokenNeverEqualsHashInLogs(t *testing.T) {
	full, prefix, hash, err := AgentTokenMaterial()
	if err != nil {
		t.Fatal(err)
	}
	if full == hash {
		t.Fatal("token must differ from stored hash")
	}
	if prefix == "" || !LooksLikeAgentToken(full) {
		t.Fatal("expected sagt_ token shape")
	}
}

func TestEnrollmentTokenPrefix(t *testing.T) {
	full, _, hash, err := EnrollmentTokenMaterial()
	if err != nil {
		t.Fatal(err)
	}
	if !LooksLikeEnrollmentToken(full) || hash == full {
		t.Fatal("enrollment token material invalid")
	}
}
