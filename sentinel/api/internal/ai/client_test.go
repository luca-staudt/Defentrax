package ai

import (
	"crypto/rand"
	"testing"
)

func TestEncryptDecryptAPIKey(t *testing.T) {
	key := make([]byte, 32)
	if _, err := rand.Read(key); err != nil {
		t.Fatal(err)
	}
	enc, err := EncryptAPIKey(key, "sk-test-secret")
	if err != nil {
		t.Fatal(err)
	}
	if enc == "" || enc == "sk-test-secret" {
		t.Fatalf("expected ciphertext, got %q", enc)
	}
	plain, err := DecryptAPIKey(key, enc)
	if err != nil {
		t.Fatal(err)
	}
	if plain != "sk-test-secret" {
		t.Fatalf("got %q", plain)
	}
}
