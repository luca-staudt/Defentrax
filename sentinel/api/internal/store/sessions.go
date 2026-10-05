package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

type Session struct {
	ID        uuid.UUID
	UserID    uuid.UUID
	ExpiresAt time.Time
}

func CreateSession(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, tokenHash string, expiresAt time.Time, ip string, userAgent string) (uuid.UUID, error) {
	var id uuid.UUID
	var ipVal any
	if ip != "" {
		ipVal = ip
	}
	err := pool.QueryRow(ctx, `
		INSERT INTO sessions (user_id, session_token_hash, expires_at, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id
	`, userID, tokenHash, expiresAt, ipVal, userAgent).Scan(&id)
	return id, err
}

func GetSessionByTokenHash(ctx context.Context, pool *pgxpool.Pool, tokenHash string) (Session, error) {
	var s Session
	err := pool.QueryRow(ctx, `
		SELECT id, user_id, expires_at FROM sessions
		WHERE session_token_hash = $1 AND expires_at > now()
	`, tokenHash).Scan(&s.ID, &s.UserID, &s.ExpiresAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return Session{}, ErrNotFound
	}
	return s, err
}

func DeleteSessionByTokenHash(ctx context.Context, pool *pgxpool.Pool, tokenHash string) error {
	_, err := pool.Exec(ctx, `DELETE FROM sessions WHERE session_token_hash = $1`, tokenHash)
	return err
}

func DeleteSessionByID(ctx context.Context, pool *pgxpool.Pool, sessionID uuid.UUID) error {
	_, err := pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, sessionID)
	return err
}

func PurgeExpiredSessions(ctx context.Context, pool *pgxpool.Pool) error {
	_, err := pool.Exec(ctx, `DELETE FROM sessions WHERE expires_at <= now()`)
	return err
}
