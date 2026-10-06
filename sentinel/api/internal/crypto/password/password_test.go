package password_test

import (
	"testing"

	"golang.org/x/crypto/bcrypt"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/password"
)

func TestHashAndVerify(t *testing.T) {
	hash, err := password.Hash("correct horse battery staple")
	if err != nil {
		t.Fatal(err)
	}
	if err := password.Verify(hash, "correct horse battery staple"); err != nil {
		t.Fatalf("verify: %v", err)
	}
	if err := password.Verify(hash, "wrong"); err != password.ErrMismatch {
		t.Fatalf("expected mismatch, got %v", err)
	}
}

func TestVerifyBcryptLegacy(t *testing.T) {
	legacy, err := bcrypt.GenerateFromPassword([]byte("dev-only"), bcrypt.DefaultCost)
	if err != nil {
		t.Fatal(err)
	}
	if err := password.Verify(string(legacy), "dev-only"); err != nil {
		t.Fatalf("bcrypt verify: %v", err)
	}
}
