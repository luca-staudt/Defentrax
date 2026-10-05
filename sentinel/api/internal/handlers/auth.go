package handlers

import (
	"encoding/json"
	"errors"
	"io"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/challenge"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/principal"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/ratelimit"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/sessioncookie"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/totp"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/config"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

// AuthHandler implements /api/v1/auth/* endpoints.
type AuthHandler struct {
	Pool    *pgxpool.Pool
	Config  config.Config
	Limiter ratelimit.Limiter
}

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	User           *store.UserPublic `json:"user,omitempty"`
	RequiresTOTP   bool              `json:"requires_totp"`
	LoginChallenge string            `json:"login_challenge,omitempty"`
}

type totpVerifyRequest struct {
	LoginChallenge string `json:"login_challenge"`
	Code           string `json:"code"`
}

type totpEnrollResponse struct {
	ProvisioningURI string   `json:"provisioning_uri"`
	Secret          string   `json:"secret"`
	RecoveryCodes   []string `json:"recovery_codes"`
}

type totpConfirmRequest struct {
	Code string `json:"code"`
}

type totpDisableRequest struct {
	Password string `json:"password"`
	Code     string `json:"code"`
}

type recoveryRequest struct {
	LoginChallenge string `json:"login_challenge"`
	RecoveryCode   string `json:"recovery_code"`
}

func (h *AuthHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	var req loginRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	email := strings.TrimSpace(strings.ToLower(req.Email))
	if email == "" || req.Password == "" {
		badRequest(w, r, "invalid_credentials", "email and password required")
		return
	}

	ip := clientIP(r)
	limitKey := email + "|" + ip
	allowed, err := h.Limiter.Allow(r.Context(), limitKey)
	if err != nil || !allowed {
		auditAuth(r, h.Pool, nil, "auth.login_failed", map[string]any{"reason": "rate_limited"}, ip, r.UserAgent())
		apperrors.WriteJSON(w, http.StatusTooManyRequests, "rate_limited", "too many login attempts", middleware.RequestIDFromContext(r.Context()))
		return
	}

	user, err := store.GetUserByEmail(r.Context(), h.Pool, email)
	if err != nil || !user.IsActive {
		auditAuth(r, h.Pool, nil, "auth.login_failed", map[string]any{"reason": "invalid_credentials"}, ip, r.UserAgent())
		apperrors.WriteJSON(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := password.Verify(user.PasswordHash, req.Password); err != nil {
		uid := user.ID
		auditAuth(r, h.Pool, &uid, "auth.login_failed", map[string]any{"reason": "invalid_credentials"}, ip, r.UserAgent())
		apperrors.WriteJSON(w, http.StatusUnauthorized, "invalid_credentials", "invalid email or password", middleware.RequestIDFromContext(r.Context()))
		return
	}

	tf, tfErr := store.GetTwoFactor(r.Context(), h.Pool, user.ID)
	if tfErr == nil && tf.Enabled {
		ch, err := challenge.Sign(h.Config.SessionSecret, user.ID, 5*time.Minute)
		if err != nil {
			internalError(w, r)
			return
		}
		writeJSON(w, http.StatusOK, loginResponse{RequiresTOTP: true, LoginChallenge: ch})
		return
	}

	if err := h.finishLogin(w, r, user.ID, user.Email, ip); err != nil {
		internalError(w, r)
		return
	}
}

func (h *AuthHandler) VerifyTOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	ip := clientIP(r)
	if h.Limiter != nil {
		allowed, err := h.Limiter.Allow(r.Context(), "totp|"+ip)
		if err != nil || !allowed {
			apperrors.WriteJSON(w, http.StatusTooManyRequests, "rate_limited", "too many authentication attempts", middleware.RequestIDFromContext(r.Context()))
			return
		}
	}
	var req totpVerifyRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	userID, err := challenge.Verify(h.Config.SessionSecret, req.LoginChallenge)
	if err != nil {
		badRequest(w, r, "invalid_challenge", "login challenge invalid or expired")
		return
	}
	if err := h.verifyTOTPCode(r, userID, req.Code); err != nil {
		uid := userID
		auditAuth(r, h.Pool, &uid, "auth.login_failed", map[string]any{"reason": "totp_invalid"}, ip, r.UserAgent())
		apperrors.WriteJSON(w, http.StatusUnauthorized, "invalid_totp", "invalid authentication code", middleware.RequestIDFromContext(r.Context()))
		return
	}
	user, err := store.GetUserByID(r.Context(), h.Pool, userID)
	if err != nil {
		internalError(w, r)
		return
	}
	if err := h.finishLogin(w, r, user.ID, user.Email, ip); err != nil {
		internalError(w, r)
		return
	}
}

func (h *AuthHandler) VerifyRecovery(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	ip := clientIP(r)
	if h.Limiter != nil {
		allowed, err := h.Limiter.Allow(r.Context(), "recovery|"+ip)
		if err != nil || !allowed {
			apperrors.WriteJSON(w, http.StatusTooManyRequests, "rate_limited", "too many authentication attempts", middleware.RequestIDFromContext(r.Context()))
			return
		}
	}
	var req recoveryRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	userID, err := challenge.Verify(h.Config.SessionSecret, req.LoginChallenge)
	if err != nil {
		badRequest(w, r, "invalid_challenge", "login challenge invalid or expired")
		return
	}
	tf, err := store.GetTwoFactor(r.Context(), h.Pool, userID)
	if err != nil {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "invalid_recovery", "recovery not available", middleware.RequestIDFromContext(r.Context()))
		return
	}
	newBlob, ok, err := totp.ConsumeRecoveryCode(tf.BackupCodesHash, req.RecoveryCode)
	if err != nil || !ok {
		uid := userID
		auditAuth(r, h.Pool, &uid, "auth.login_failed", map[string]any{"reason": "recovery_invalid"}, ip, r.UserAgent())
		apperrors.WriteJSON(w, http.StatusUnauthorized, "invalid_recovery", "invalid recovery code", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := store.UpdateBackupCodes(r.Context(), h.Pool, userID, newBlob); err != nil {
		internalError(w, r)
		return
	}
	user, err := store.GetUserByID(r.Context(), h.Pool, userID)
	if err != nil {
		internalError(w, r)
		return
	}
	if err := h.finishLogin(w, r, user.ID, user.Email, ip); err != nil {
		internalError(w, r)
		return
	}
}

func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if token, ok := sessioncookie.Read(r, h.Config.SessionCookieName); ok {
		_ = store.DeleteSessionByTokenHash(r.Context(), h.Pool, secrets.HashToken(token))
	}
	sessioncookie.Clear(w, h.Config.SessionCookieName, h.Config.CookieSecure)
	uid := p.UserID
	auditAuth(r, h.Pool, &uid, "auth.logout", nil, clientIP(r), r.UserAgent())
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	roles, _ := store.ListUserRoles(r.Context(), h.Pool, p.UserID)
	perms, _ := store.ListPermissionsForUser(r.Context(), h.Pool, p.UserID)
	writeJSON(w, http.StatusOK, map[string]any{
		"id":           p.UserID,
		"email":        p.Email,
		"display_name": "",
		"is_active":    true,
		"roles":        roles,
		"permissions":  perms,
	})
}

func (h *AuthHandler) EnrollTOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if len(h.Config.TOTPEncryptionKey) != 32 {
		apperrors.WriteJSON(w, http.StatusServiceUnavailable, "totp_unconfigured", "two-factor encryption key not configured", middleware.RequestIDFromContext(r.Context()))
		return
	}
	enroll, err := totp.GenerateEnrollment(p.Email)
	if err != nil {
		internalError(w, r)
		return
	}
	enc, err := totp.EncryptSecret(h.Config.TOTPEncryptionKey, enroll.Secret)
	if err != nil {
		internalError(w, r)
		return
	}
	backupJSON, err := totp.HashRecoveryCodes(enroll.RecoveryCodes)
	if err != nil {
		internalError(w, r)
		return
	}
	if err := store.UpsertTwoFactorPending(r.Context(), h.Pool, p.UserID, enc, backupJSON); err != nil {
		internalError(w, r)
		return
	}
	writeJSON(w, http.StatusOK, totpEnrollResponse{
		ProvisioningURI: enroll.ProvisioningURI,
		Secret:          enroll.Secret,
		RecoveryCodes:   enroll.RecoveryCodes,
	})
}

func (h *AuthHandler) ConfirmTOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req totpConfirmRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	if err := h.verifyTOTPCode(r, p.UserID, req.Code); err != nil {
		apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_totp", "invalid authentication code", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := store.EnableTwoFactor(r.Context(), h.Pool, p.UserID); err != nil {
		internalError(w, r)
		return
	}
	uid := p.UserID
	auditAuth(r, h.Pool, &uid, "auth.totp_enabled", nil, clientIP(r), r.UserAgent())
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) DisableTOTP(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		methodNotAllowed(w, r)
		return
	}
	p, ok := principal.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	var req totpDisableRequest
	if err := decodeJSON(r, &req); err != nil {
		badRequest(w, r, "invalid_json", "invalid request body")
		return
	}
	user, err := store.GetUserByID(r.Context(), h.Pool, p.UserID)
	if err != nil {
		internalError(w, r)
		return
	}
	if err := password.Verify(user.PasswordHash, req.Password); err != nil {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "invalid_credentials", "invalid password", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := h.verifyTOTPCode(r, p.UserID, req.Code); err != nil {
		apperrors.WriteJSON(w, http.StatusBadRequest, "invalid_totp", "invalid authentication code", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if err := store.DisableTwoFactor(r.Context(), h.Pool, p.UserID); err != nil {
		internalError(w, r)
		return
	}
	uid := p.UserID
	auditAuth(r, h.Pool, &uid, "auth.totp_disabled", nil, clientIP(r), r.UserAgent())
	w.WriteHeader(http.StatusNoContent)
}

func (h *AuthHandler) finishLogin(w http.ResponseWriter, r *http.Request, userID uuid.UUID, email, ip string) error {
	token, err := secrets.RandomToken(32)
	if err != nil {
		return err
	}
	expires := time.Now().Add(h.Config.SessionTTL)
	_, err = store.CreateSession(r.Context(), h.Pool, userID, secrets.HashToken(token), expires, ip, r.UserAgent())
	if err != nil {
		return err
	}
	_ = store.TouchLastLogin(r.Context(), h.Pool, userID)
	sessioncookie.Set(w, h.Config.SessionCookieName, token, h.Config.SessionTTL, h.Config.CookieSecure)

	roles, err := store.ListUserRoles(r.Context(), h.Pool, userID)
	if err != nil {
		return err
	}
	uid := userID
	auditAuth(r, h.Pool, &uid, "auth.login", nil, ip, r.UserAgent())
	writeJSON(w, http.StatusOK, loginResponse{
		User: &store.UserPublic{
			ID:    userID,
			Email: email,
			Roles: roles,
		},
	})
	return nil
}

func (h *AuthHandler) verifyTOTPCode(r *http.Request, userID uuid.UUID, code string) error {
	tf, err := store.GetTwoFactor(r.Context(), h.Pool, userID)
	if err != nil {
		return err
	}
	secret, err := totp.DecryptSecret(h.Config.TOTPEncryptionKey, tf.TOTPSecretEncrypted)
	if err != nil {
		return err
	}
	if !totp.ValidateCodeWithOpts(secret, code) {
		return errors.New("invalid totp")
	}
	return nil
}

func decodeJSON(r *http.Request, dst any) error {
	defer r.Body.Close()
	dec := json.NewDecoder(io.LimitReader(r.Body, 1<<20))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

func auditAuth(r *http.Request, pool *pgxpool.Pool, actor *uuid.UUID, action string, meta map[string]any, ip, ua string) {
	var ipNet net.IP
	if ip != "" {
		ipNet = net.ParseIP(ip)
	}
	_ = store.Audit(r.Context(), pool, actor, "user", action, "session", nil, meta, ipNet, ua)
}

func methodNotAllowed(w http.ResponseWriter, r *http.Request) {
	apperrors.WriteJSON(w, http.StatusMethodNotAllowed, "method_not_allowed", "method not allowed", middleware.RequestIDFromContext(r.Context()))
}

func badRequest(w http.ResponseWriter, r *http.Request, code, msg string) {
	apperrors.WriteJSON(w, http.StatusBadRequest, code, msg, middleware.RequestIDFromContext(r.Context()))
}

func internalError(w http.ResponseWriter, r *http.Request) {
	apperrors.WriteJSON(w, http.StatusInternalServerError, "internal_error", "internal server error", middleware.RequestIDFromContext(r.Context()))
}
