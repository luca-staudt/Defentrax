package store

import (
	"context"
	"errors"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type TwoFactor struct {
	UserID              uuid.UUID
	TOTPSecretEncrypted string
	Enabled             bool
	BackupCodesHash     string
}

func GetTwoFactor(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) (TwoFactor, error) {
	var t TwoFactor
	err := pool.QueryRow(ctx, `
		SELECT user_id, totp_secret_encrypted, enabled, backup_codes_hash
		FROM two_factor_auth WHERE user_id = $1
	`, userID).Scan(&t.UserID, &t.TOTPSecretEncrypted, &t.Enabled, &t.BackupCodesHash)
	if errors.Is(err, pgx.ErrNoRows) {
		return TwoFactor{}, ErrNotFound
	}
	return t, err
}

func UpsertTwoFactorPending(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, secretEnc, backupJSON string) error {
	_, err := pool.Exec(ctx, `
		INSERT INTO two_factor_auth (user_id, totp_secret_encrypted, enabled, backup_codes_hash, enrolled_at, updated_at)
		VALUES ($1, $2, FALSE, $3, NULL, now())
		ON CONFLICT (user_id) DO UPDATE SET
			totp_secret_encrypted = EXCLUDED.totp_secret_encrypted,
			backup_codes_hash = EXCLUDED.backup_codes_hash,
			enabled = FALSE,
			updated_at = now()
	`, userID, secretEnc, backupJSON)
	return err
}

func EnableTwoFactor(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
		UPDATE two_factor_auth SET enabled = TRUE, enrolled_at = now(), updated_at = now()
		WHERE user_id = $1
	`, userID)
	return err
}

func DisableTwoFactor(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
		UPDATE two_factor_auth SET enabled = FALSE, totp_secret_encrypted = '', backup_codes_hash = '', updated_at = now()
		WHERE user_id = $1
	`, userID)
	return err
}

func UpdateBackupCodes(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, backupJSON string) error {
	_, err := pool.Exec(ctx, `
		UPDATE two_factor_auth SET backup_codes_hash = $2, updated_at = now() WHERE user_id = $1
	`, userID, backupJSON)
	return err
}
