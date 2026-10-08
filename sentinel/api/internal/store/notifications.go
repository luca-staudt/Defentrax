package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// NotificationChannel is a delivery target (Discord/Slack/email/webhook).
type NotificationChannel struct {
	ID               uuid.UUID
	Name             string
	ChannelType      string
	Config           json.RawMessage
	SecretsEncrypted string
	HasSecrets       bool
	Enabled          bool
	CreatedAt        time.Time
	UpdatedAt        time.Time
}

// NotificationRule maps severity thresholds to channels.
type NotificationRule struct {
	ID          uuid.UUID
	Name        string
	Enabled     bool
	MinSeverity string
	Triggers    []string
	ChannelIDs  []uuid.UUID
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// NotificationDelivery is one attempt/record of notifying for an alert.
type NotificationDelivery struct {
	ID            uuid.UUID
	AlertID       uuid.UUID
	ChannelID     uuid.UUID
	Status        string
	Payload       json.RawMessage
	Error         string
	AttemptCount  int
	TriggerEvent  string
	NextAttemptAt *time.Time
	LastAttemptAt *time.Time
	SentAt        *time.Time
	CreatedAt     time.Time
}

type ChannelCreateParams struct {
	Name             string
	ChannelType      string
	Config           json.RawMessage
	SecretsEncrypted string
	HasSecrets       bool
	Enabled          bool
}

type ChannelUpdateParams struct {
	Name             *string
	Config           json.RawMessage
	SecretsEncrypted *string
	HasSecrets       *bool
	Enabled          *bool
}

type RuleCreateParams struct {
	Name        string
	Enabled     bool
	MinSeverity string
	Triggers    []string
	ChannelIDs  []uuid.UUID
}

type RuleUpdateParams struct {
	Name        *string
	Enabled     *bool
	MinSeverity *string
	Triggers    []string
	ChannelIDs  []uuid.UUID
}

type DeliveryCreateParams struct {
	AlertID      uuid.UUID
	ChannelID    uuid.UUID
	Payload      json.RawMessage
	TriggerEvent string
}

func CreateNotificationChannel(ctx context.Context, pool *pgxpool.Pool, p ChannelCreateParams) (NotificationChannel, error) {
	if len(p.Config) == 0 {
		p.Config = []byte("{}")
	}
	var c NotificationChannel
	err := pool.QueryRow(ctx, `
INSERT INTO notification_channels (name, channel_type, config, secrets_encrypted, has_secrets, enabled)
VALUES ($1, $2, $3::jsonb, $4, $5, $6)
RETURNING id, name, channel_type, config, secrets_encrypted, has_secrets, enabled, created_at, updated_at
`, p.Name, p.ChannelType, p.Config, p.SecretsEncrypted, p.HasSecrets, p.Enabled).Scan(
		&c.ID, &c.Name, &c.ChannelType, &c.Config, &c.SecretsEncrypted, &c.HasSecrets, &c.Enabled, &c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}

func ListNotificationChannels(ctx context.Context, pool *pgxpool.Pool) ([]NotificationChannel, error) {
	rows, err := pool.Query(ctx, `
SELECT id, name, channel_type, config, secrets_encrypted, has_secrets, enabled, created_at, updated_at
FROM notification_channels
ORDER BY name
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NotificationChannel
	for rows.Next() {
		var c NotificationChannel
		if err := rows.Scan(&c.ID, &c.Name, &c.ChannelType, &c.Config, &c.SecretsEncrypted, &c.HasSecrets, &c.Enabled, &c.CreatedAt, &c.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}

func GetNotificationChannel(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (NotificationChannel, error) {
	var c NotificationChannel
	err := pool.QueryRow(ctx, `
SELECT id, name, channel_type, config, secrets_encrypted, has_secrets, enabled, created_at, updated_at
FROM notification_channels WHERE id = $1
`, id).Scan(&c.ID, &c.Name, &c.ChannelType, &c.Config, &c.SecretsEncrypted, &c.HasSecrets, &c.Enabled, &c.CreatedAt, &c.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return NotificationChannel{}, ErrNotFound
	}
	return c, err
}

func UpdateNotificationChannel(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, p ChannelUpdateParams) (NotificationChannel, error) {
	cur, err := GetNotificationChannel(ctx, pool, id)
	if err != nil {
		return NotificationChannel{}, err
	}
	name := cur.Name
	if p.Name != nil {
		name = *p.Name
	}
	config := cur.Config
	if p.Config != nil {
		config = p.Config
	}
	secrets := cur.SecretsEncrypted
	hasSecrets := cur.HasSecrets
	if p.SecretsEncrypted != nil {
		secrets = *p.SecretsEncrypted
	}
	if p.HasSecrets != nil {
		hasSecrets = *p.HasSecrets
	}
	enabled := cur.Enabled
	if p.Enabled != nil {
		enabled = *p.Enabled
	}
	var c NotificationChannel
	err = pool.QueryRow(ctx, `
UPDATE notification_channels
SET name = $2, config = $3::jsonb, secrets_encrypted = $4, has_secrets = $5, enabled = $6, updated_at = now()
WHERE id = $1
RETURNING id, name, channel_type, config, secrets_encrypted, has_secrets, enabled, created_at, updated_at
`, id, name, config, secrets, hasSecrets, enabled).Scan(
		&c.ID, &c.Name, &c.ChannelType, &c.Config, &c.SecretsEncrypted, &c.HasSecrets, &c.Enabled, &c.CreatedAt, &c.UpdatedAt,
	)
	return c, err
}

func DeleteNotificationChannel(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) error {
	tag, err := pool.Exec(ctx, `DELETE FROM notification_channels WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func CreateNotificationRule(ctx context.Context, pool *pgxpool.Pool, p RuleCreateParams) (NotificationRule, error) {
	if p.Triggers == nil {
		p.Triggers = []string{"alert.created"}
	}
	if p.ChannelIDs == nil {
		p.ChannelIDs = []uuid.UUID{}
	}
	var r NotificationRule
	err := pool.QueryRow(ctx, `
INSERT INTO notification_rules (name, enabled, min_severity, triggers, channel_ids)
VALUES ($1, $2, $3, $4, $5)
RETURNING id, name, enabled, min_severity, triggers, channel_ids, created_at, updated_at
`, p.Name, p.Enabled, p.MinSeverity, p.Triggers, p.ChannelIDs).Scan(
		&r.ID, &r.Name, &r.Enabled, &r.MinSeverity, &r.Triggers, &r.ChannelIDs, &r.CreatedAt, &r.UpdatedAt,
	)
	return r, err
}

func ListNotificationRules(ctx context.Context, pool *pgxpool.Pool) ([]NotificationRule, error) {
	rows, err := pool.Query(ctx, `
SELECT id, name, enabled, min_severity, triggers, channel_ids, created_at, updated_at
FROM notification_rules
ORDER BY name
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NotificationRule
	for rows.Next() {
		var r NotificationRule
		if err := rows.Scan(&r.ID, &r.Name, &r.Enabled, &r.MinSeverity, &r.Triggers, &r.ChannelIDs, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		if r.Triggers == nil {
			r.Triggers = []string{}
		}
		if r.ChannelIDs == nil {
			r.ChannelIDs = []uuid.UUID{}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func ListEnabledNotificationRules(ctx context.Context, pool *pgxpool.Pool) ([]NotificationRule, error) {
	rows, err := pool.Query(ctx, `
SELECT id, name, enabled, min_severity, triggers, channel_ids, created_at, updated_at
FROM notification_rules
WHERE enabled = TRUE
ORDER BY name
`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NotificationRule
	for rows.Next() {
		var r NotificationRule
		if err := rows.Scan(&r.ID, &r.Name, &r.Enabled, &r.MinSeverity, &r.Triggers, &r.ChannelIDs, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		if r.Triggers == nil {
			r.Triggers = []string{}
		}
		if r.ChannelIDs == nil {
			r.ChannelIDs = []uuid.UUID{}
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

func GetNotificationRule(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (NotificationRule, error) {
	var r NotificationRule
	err := pool.QueryRow(ctx, `
SELECT id, name, enabled, min_severity, triggers, channel_ids, created_at, updated_at
FROM notification_rules WHERE id = $1
`, id).Scan(&r.ID, &r.Name, &r.Enabled, &r.MinSeverity, &r.Triggers, &r.ChannelIDs, &r.CreatedAt, &r.UpdatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return NotificationRule{}, ErrNotFound
	}
	if r.Triggers == nil {
		r.Triggers = []string{}
	}
	if r.ChannelIDs == nil {
		r.ChannelIDs = []uuid.UUID{}
	}
	return r, err
}

func UpdateNotificationRule(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, p RuleUpdateParams) (NotificationRule, error) {
	cur, err := GetNotificationRule(ctx, pool, id)
	if err != nil {
		return NotificationRule{}, err
	}
	name := cur.Name
	if p.Name != nil {
		name = *p.Name
	}
	enabled := cur.Enabled
	if p.Enabled != nil {
		enabled = *p.Enabled
	}
	minSev := cur.MinSeverity
	if p.MinSeverity != nil {
		minSev = *p.MinSeverity
	}
	triggers := cur.Triggers
	if p.Triggers != nil {
		triggers = p.Triggers
	}
	channelIDs := cur.ChannelIDs
	if p.ChannelIDs != nil {
		channelIDs = p.ChannelIDs
	}
	var r NotificationRule
	err = pool.QueryRow(ctx, `
UPDATE notification_rules
SET name = $2, enabled = $3, min_severity = $4, triggers = $5, channel_ids = $6, updated_at = now()
WHERE id = $1
RETURNING id, name, enabled, min_severity, triggers, channel_ids, created_at, updated_at
`, id, name, enabled, minSev, triggers, channelIDs).Scan(
		&r.ID, &r.Name, &r.Enabled, &r.MinSeverity, &r.Triggers, &r.ChannelIDs, &r.CreatedAt, &r.UpdatedAt,
	)
	if r.Triggers == nil {
		r.Triggers = []string{}
	}
	if r.ChannelIDs == nil {
		r.ChannelIDs = []uuid.UUID{}
	}
	return r, err
}

func DeleteNotificationRule(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) error {
	tag, err := pool.Exec(ctx, `DELETE FROM notification_rules WHERE id = $1`, id)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

func CreateNotificationDelivery(ctx context.Context, pool *pgxpool.Pool, p DeliveryCreateParams) (uuid.UUID, error) {
	if len(p.Payload) == 0 {
		p.Payload = []byte("{}")
	}
	var id uuid.UUID
	err := pool.QueryRow(ctx, `
INSERT INTO notifications (alert_id, channel_id, status, payload, trigger_event, attempt_count, next_attempt_at)
VALUES ($1, $2, 'pending', $3::jsonb, $4, 0, NULL)
RETURNING id
`, p.AlertID, p.ChannelID, p.Payload, p.TriggerEvent).Scan(&id)
	return id, err
}

func MarkNotificationSent(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, attempts int) error {
	_, err := pool.Exec(ctx, `
UPDATE notifications
SET status = 'sent', attempt_count = $2, last_attempt_at = now(), sent_at = now(), next_attempt_at = NULL, error = ''
WHERE id = $1
`, id, attempts)
	return err
}

func MarkNotificationFailed(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, attempts int, errMsg string, nextAttempt *time.Time, final bool) error {
	status := "pending"
	if final {
		status = "failed"
	}
	_, err := pool.Exec(ctx, `
UPDATE notifications
SET status = $2, attempt_count = $3, last_attempt_at = now(), error = $4, next_attempt_at = $5
WHERE id = $1
`, id, status, attempts, errMsg, nextAttempt)
	return err
}

// ListPendingNotificationDeliveries returns due pending rows (next_attempt_at set and due).
func ListPendingNotificationDeliveries(ctx context.Context, pool *pgxpool.Pool, limit int) ([]NotificationDelivery, error) {
	if limit < 1 {
		limit = 50
	}
	rows, err := pool.Query(ctx, `
SELECT id, alert_id, channel_id, status, payload, error, attempt_count, trigger_event, next_attempt_at, last_attempt_at, sent_at, created_at
FROM notifications
WHERE status = 'pending' AND next_attempt_at IS NOT NULL AND next_attempt_at <= now()
ORDER BY created_at
LIMIT $1
`, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []NotificationDelivery
	for rows.Next() {
		var d NotificationDelivery
		if err := rows.Scan(&d.ID, &d.AlertID, &d.ChannelID, &d.Status, &d.Payload, &d.Error, &d.AttemptCount, &d.TriggerEvent, &d.NextAttemptAt, &d.LastAttemptAt, &d.SentAt, &d.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

type ChannelDeliveryRow struct {
	ID           uuid.UUID
	AlertID      uuid.UUID
	AlertTitle   string
	Status       string
	Error        string
	AttemptCount int
	TriggerEvent string
	SentAt       *time.Time
	CreatedAt    time.Time
}

func ListChannelDeliveries(ctx context.Context, pool *pgxpool.Pool, channelID uuid.UUID, limit int) ([]ChannelDeliveryRow, error) {
	if limit < 1 {
		limit = 30
	}
	if limit > 100 {
		limit = 100
	}
	rows, err := pool.Query(ctx, `
SELECT n.id, n.alert_id, COALESCE(a.title, ''), n.status, n.error, n.attempt_count, n.trigger_event, n.sent_at, n.created_at
FROM notifications n
LEFT JOIN alerts a ON a.id = n.alert_id
WHERE n.channel_id = $1
ORDER BY n.created_at DESC
LIMIT $2
`, channelID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ChannelDeliveryRow
	for rows.Next() {
		var row ChannelDeliveryRow
		if err := rows.Scan(&row.ID, &row.AlertID, &row.AlertTitle, &row.Status, &row.Error, &row.AttemptCount, &row.TriggerEvent, &row.SentAt, &row.CreatedAt); err != nil {
			return nil, err
		}
		out = append(out, row)
	}
	return out, rows.Err()
}

func GetNotificationDelivery(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (NotificationDelivery, error) {
	var d NotificationDelivery
	err := pool.QueryRow(ctx, `
SELECT id, alert_id, channel_id, status, payload, error, attempt_count, trigger_event, next_attempt_at, last_attempt_at, sent_at, created_at
FROM notifications WHERE id = $1
`, id).Scan(&d.ID, &d.AlertID, &d.ChannelID, &d.Status, &d.Payload, &d.Error, &d.AttemptCount, &d.TriggerEvent, &d.NextAttemptAt, &d.LastAttemptAt, &d.SentAt, &d.CreatedAt)
	if errors.Is(err, pgx.ErrNoRows) {
		return NotificationDelivery{}, ErrNotFound
	}
	return d, err
}
