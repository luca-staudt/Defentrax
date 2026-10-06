package totp

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/pquerna/otp"
	otplib "github.com/pquerna/otp/totp"
	"golang.org/x/crypto/bcrypt"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/encrypt"
)

const (
	issuer         = "Sentinel"
	recoveryCount  = 10
	recoveryLength = 10
)

// EnrollResult holds enrollment data returned once to the client.
type EnrollResult struct {
	Secret          string   `json:"secret"`
	ProvisioningURI string   `json:"provisioning_uri"`
	RecoveryCodes   []string `json:"recovery_codes"`
}

// GenerateEnrollment creates a new TOTP key and recovery codes (plaintext recovery codes shown once).
func GenerateEnrollment(accountName string) (*EnrollResult, error) {
	key, err := otplib.Generate(otplib.GenerateOpts{
		Issuer:      issuer,
		AccountName: accountName,
	})
	if err != nil {
		return nil, err
	}
	codes, err := generateRecoveryCodes(recoveryCount)
	if err != nil {
		return nil, err
	}
	return &EnrollResult{
		Secret:          key.Secret(),
		ProvisioningURI: key.URL(),
		RecoveryCodes:   codes,
	}, nil
}

// EncryptSecret encrypts the TOTP secret for storage.
func EncryptSecret(encKey []byte, secret string) (string, error) {
	return encrypt.EncryptAESGCM(encKey, []byte(secret))
}

// DecryptSecret decrypts stored TOTP secret.
func DecryptSecret(encKey []byte, stored string) (string, error) {
	b, err := encrypt.DecryptAESGCM(encKey, stored)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ValidateCode checks a 6-digit TOTP for the decrypted secret.
func ValidateCode(secret, code string) bool {
	code = strings.TrimSpace(code)
	return otplib.Validate(code, secret)
}

// HashRecoveryCodes stores bcrypt hashes as JSON string array in DB column.
func HashRecoveryCodes(codes []string) (string, error) {
	hashes := make([]string, 0, len(codes))
	for _, c := range codes {
		h, err := bcrypt.GenerateFromPassword([]byte(strings.TrimSpace(c)), bcrypt.DefaultCost)
		if err != nil {
			return "", err
		}
		hashes = append(hashes, string(h))
	}
	b, err := json.Marshal(hashes)
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// ConsumeRecoveryCode verifies a code and returns updated hash blob with used code removed.
func ConsumeRecoveryCode(storedJSON, code string) (newStored string, ok bool, err error) {
	var hashes []string
	if err := json.Unmarshal([]byte(storedJSON), &hashes); err != nil {
		return "", false, err
	}
	code = strings.TrimSpace(code)
	for i, h := range hashes {
		if bcrypt.CompareHashAndPassword([]byte(h), []byte(code)) == nil {
			hashes = append(hashes[:i], hashes[i+1:]...)
			b, err := json.Marshal(hashes)
			if err != nil {
				return "", true, err
			}
			return string(b), true, nil
		}
	}
	return storedJSON, false, nil
}

func generateRecoveryCodes(n int) ([]string, error) {
	out := make([]string, 0, n)
	for i := 0; i < n; i++ {
		b := make([]byte, recoveryLength)
		if _, err := rand.Read(b); err != nil {
			return nil, err
		}
		out = append(out, base64.RawURLEncoding.EncodeToString(b)[:recoveryLength])
	}
	return out, nil
}

// ValidateOpts wraps otp validation period skew.
func ValidateOpts() otplib.ValidateOpts {
	return otplib.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	}
}

func ValidateCodeWithOpts(secret, code string) bool {
	ok, err := otplib.ValidateCustom(code, secret, time.Now(), ValidateOpts())
	return err == nil && ok
}

// FormatAccountEmail normalizes account label for provisioning URI.
func FormatAccountEmail(email string) string {
	return fmt.Sprintf("%s", strings.TrimSpace(email))
}
