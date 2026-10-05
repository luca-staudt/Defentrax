package store

import (
	"context"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrEnrollmentTokenInvalid = errors.New("enrollment token invalid or expired")
	ErrEnrollmentTokenUsed    = errors.New("enrollment token already used")
)

type Server struct {
	ID        uuid.UUID
	Name      string
	Hostname  string
	CreatedAt time.Time
}

type AgentRecord struct {
	ID              uuid.UUID
	ServerID        uuid.UUID
	Name            string
	Status          string
	AgentVersion    string
	LastHeartbeatAt *time.Time
}

type AgentTokenRecord struct {
	ID         uuid.UUID
	AgentID    uuid.UUID
	TokenHash  string
	TokenPrefix string
	RevokedAt  *time.Time
}

type EnrollmentTokenRecord struct {
	ID        uuid.UUID
	ServerID  uuid.UUID
	ExpiresAt time.Time
	UsedAt    *time.Time
	RevokedAt *time.Time
}

func CreateServer(ctx context.Context, pool *pgxpool.Pool, name, hostname, description, environment string) (Server, error) {
	var s Server
	err := pool.QueryRow(ctx, `
		INSERT INTO servers (name, hostname, description, environment)
		VALUES ($1, $2, $3, $4)
		RETURNING id, name, hostname, created_at
	`, name, hostname, description, environment).Scan(&s.ID, &s.Name, &s.Hostname, &s.CreatedAt)
	return s, err
}

func ListServers(ctx context.Context, pool *pgxpool.Pool) ([]Server, error) {
	rows, err := pool.Query(ctx, `
		SELECT id, name, hostname, created_at FROM servers ORDER BY name
	`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Server
	for rows.Next() {
		var s Server
		if err := rows.Scan(&s.ID, &s.Name, &s.Hostname, &s.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, s)
	}
	return out, rows.Err()
}

func CreateEnrollmentToken(ctx context.Context, pool *pgxpool.Pool, serverID uuid.UUID, hash, prefix, label string, expiresAt time.Time, createdBy *uuid.UUID) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO agent_enrollment_tokens (server_id, token_hash, token_prefix, label, expires_at, created_by_user_id)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id
	`, serverID, hash, prefix, label, expiresAt, createdBy).Scan(&id)
	return id, err
}

func GetEnrollmentTokenByHash(ctx context.Context, pool *pgxpool.Pool, hash string) (EnrollmentTokenRecord, error) {
	var rec EnrollmentTokenRecord
	err := pool.QueryRow(ctx, `
		SELECT id, server_id, expires_at, used_at, revoked_at
		FROM agent_enrollment_tokens
		WHERE token_hash = $1
	`, hash).Scan(&rec.ID, &rec.ServerID, &rec.ExpiresAt, &rec.UsedAt, &rec.RevokedAt)
	return rec, err
}

func MarkEnrollmentTokenUsed(ctx context.Context, pool *pgxpool.Pool, tokenID, agentID uuid.UUID) error {
	_, err := pool.Exec(ctx, `
		UPDATE agent_enrollment_tokens
		SET used_at = now(), used_by_agent_id = $2
		WHERE id = $1 AND used_at IS NULL AND revoked_at IS NULL
	`, tokenID, agentID)
	return err
}

func CreateAgent(ctx context.Context, pool *pgxpool.Pool, serverID uuid.UUID, name, version string) (AgentRecord, error) {
	var a AgentRecord
	err := pool.QueryRow(ctx, `
		INSERT INTO agents (server_id, name, status, agent_version)
		VALUES ($1, $2, 'active', $3)
		RETURNING id, server_id, name, status, agent_version, last_heartbeat_at
	`, serverID, name, version).Scan(&a.ID, &a.ServerID, &a.Name, &a.Status, &a.AgentVersion, &a.LastHeartbeatAt)
	return a, err
}

func CreateAgentToken(ctx context.Context, pool *pgxpool.Pool, agentID uuid.UUID, hash, prefix, label string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO agent_tokens (agent_id, token_hash, token_prefix, label)
		VALUES ($1, $2, $3, $4)
		RETURNING id
	`, agentID, hash, prefix, label).Scan(&id)
	return id, err
}

func LookupAgentByTokenHash(ctx context.Context, pool *pgxpool.Pool, hash string) (AgentTokenRecord, AgentRecord, error) {
	var tok AgentTokenRecord
	var agent AgentRecord
	err := pool.QueryRow(ctx, `
		SELECT t.id, t.agent_id, t.token_hash, t.token_prefix, t.revoked_at,
		       a.id, a.server_id, a.name, a.status, a.agent_version, a.last_heartbeat_at
		FROM agent_tokens t
		JOIN agents a ON a.id = t.agent_id
		WHERE t.token_hash = $1
		  AND t.revoked_at IS NULL
		  AND (t.expires_at IS NULL OR t.expires_at > now())
		  AND a.status IN ('active', 'pending', 'offline')
	`, hash).Scan(
		&tok.ID, &tok.AgentID, &tok.TokenHash, &tok.TokenPrefix, &tok.RevokedAt,
		&agent.ID, &agent.ServerID, &agent.Name, &agent.Status, &agent.AgentVersion, &agent.LastHeartbeatAt,
	)
	return tok, agent, err
}

func TouchAgentHeartbeat(ctx context.Context, pool *pgxpool.Pool, agentID uuid.UUID, version string) error {
	_, err := pool.Exec(ctx, `
		UPDATE agents
		SET last_heartbeat_at = now(),
		    updated_at = now(),
		    status = 'active',
		    agent_version = CASE WHEN $2 <> '' THEN $2 ELSE agent_version END
		WHERE id = $1
	`, agentID, version)
	return err
}

func InsertEvent(ctx context.Context, pool *pgxpool.Pool, agentID, serverID uuid.UUID, ingestID string, occurredAt time.Time, source, category, severity, host, message, fingerprint string, raw, fields []byte) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
		INSERT INTO events (agent_id, server_id, occurred_at, source, category, severity, host, message, raw, fields, fingerprint, ingest_id)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10::jsonb, $11, $12)
		ON CONFLICT (agent_id, ingest_id) DO NOTHING
		RETURNING id
	`, agentID, serverID, occurredAt, source, category, severity, host, message, raw, fields, fingerprint, ingestID).Scan(&id)
	if errors.Is(err, pgx.ErrNoRows) {
		return uuid.Nil, nil
	}
	return id, err
}
