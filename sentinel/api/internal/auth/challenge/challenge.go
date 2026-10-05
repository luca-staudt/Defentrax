package challenge

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

var ErrInvalid = errors.New("invalid login challenge")

type payload struct {
	UserID string `json:"uid"`
	Exp    int64  `json:"exp"`
}

// Sign creates an HMAC-signed login challenge for pending 2FA.
func Sign(secret []byte, userID uuid.UUID, ttl time.Duration) (string, error) {
	if len(secret) < 16 {
		return "", fmt.Errorf("session secret too short")
	}
	p := payload{UserID: userID.String(), Exp: time.Now().Add(ttl).Unix()}
	body, err := json.Marshal(p)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	sig := mac.Sum(nil)
	return base64.RawURLEncoding.EncodeToString(body) + "." + base64.RawURLEncoding.EncodeToString(sig), nil
}

// Verify parses and validates a login challenge token.
func Verify(secret []byte, token string) (uuid.UUID, error) {
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return uuid.Nil, ErrInvalid
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return uuid.Nil, ErrInvalid
	}
	sig, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil {
		return uuid.Nil, ErrInvalid
	}
	mac := hmac.New(sha256.New, secret)
	mac.Write(body)
	if !hmac.Equal(mac.Sum(nil), sig) {
		return uuid.Nil, ErrInvalid
	}
	var p payload
	if err := json.Unmarshal(body, &p); err != nil {
		return uuid.Nil, ErrInvalid
	}
	if time.Now().Unix() > p.Exp {
		return uuid.Nil, ErrInvalid
	}
	id, err := uuid.Parse(p.UserID)
	if err != nil {
		return uuid.Nil, ErrInvalid
	}
	return id, nil
}
