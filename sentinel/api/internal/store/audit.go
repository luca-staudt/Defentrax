package store

import (
	"context"
	"encoding/json"
	"net"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// Audit writes an audit_logs row. Metadata must not contain secrets.
func Audit(ctx context.Context, pool *pgxpool.Pool, actorUserID *uuid.UUID, actorType, action, entityType string, entityID *uuid.UUID, metadata map[string]any, ip net.IP, userAgent string) error {
	var meta []byte
	if metadata != nil {
		b, err := json.Marshal(metadata)
		if err != nil {
			return err
		}
		meta = b
	} else {
		meta = []byte("{}")
	}
	var ipVal any
	if ip != nil {
		ipVal = ip.String()
	}
	_, err := pool.Exec(ctx, `
		INSERT INTO audit_logs (actor_user_id, actor_type, action, entity_type, entity_id, metadata, ip_address, user_agent)
		VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8)
	`, actorUserID, actorType, action, entityType, entityID, meta, ipVal, userAgent)
	return err
}
