package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type APIKeyRecord struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	Name      string
	KeyPrefix string
	CreatedAt time.Time
	RevokedAt *time.Time
}

func CreateAPIKey(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, name, keyHash, prefix string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO api_keys (user_id, name, key_hash, key_prefix)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, userID, name, keyHash, prefix).Scan(&id)
	return id, err
}

func ListAPIKeys(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID) ([]APIKeyRecord, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, user_id, name, key_prefix, created_at, revoked_at
		FROM api_keys WHERE user_id = $1 ORDER BY created_at DESC
	`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []APIKeyRecord
	for rows.Next() {
		var r APIKeyRecord
		if err := rows.Scan(&r.ID, &r.UserID, &r.Name, &r.KeyPrefix, &r.CreatedAt, &r.RevokedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func RevokeAPIKey(ctx context.Context, pool *pgxpool.Pool, userID, keyID uuid.UUID) error {
	tag, err := pool.Exec(ctx, `
		UPDATE api_keys SET revoked_at = now()
		WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
	`, keyID, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func LookupAPIKeyByHash(ctx context.Context, pool *pgxpool.Pool, keyHash string) (APIKeyRecord, uuid.UUID, error) {
	var r APIKeyRecord
	var uid uuid.UUID
	err := pool.QueryRow(ctx, `
		SELECT k.id, k.user_id, k.name, k.key_prefix, k.created_at, k.revoked_at
		FROM api_keys k
		WHERE k.key_hash = $1 AND k.revoked_at IS NULL
		  AND (k.expires_at IS NULL OR k.expires_at > now())
	`, keyHash).Scan(&r.ID, &uid, &r.Name, &r.KeyPrefix, &r.CreatedAt, &r.RevokedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return APIKeyRecord{}, uuid.Nil, ErrNotFound
	}
	r.UserID = uid
	return r, uid, err
}

func TouchAPIKeyUsed(ctx context.Context, pool *pgxpool.Pool, keyID uuid.UUID) error {
	_, err := pool.Exec(ctx, `UPDATE api_keys SET last_used_at = now() WHERE id = $1`, keyID)
	return err
}
