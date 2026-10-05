package password

import "golang.org/x/crypto/bcrypt"

func verifyBcrypt(encoded, plaintext string) error {
	err := bcrypt.CompareHashAndPassword([]byte(encoded), []byte(plaintext))
	if err != nil {
		return ErrMismatch
	}
	return nil
}
