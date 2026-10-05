package alerts

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
)

// CooldownStore tracks recently opened alerts by dedup key (Redis or in-memory).
type CooldownStore interface {
	// Get returns the alert id cached for this dedup key, or uuid.Nil when absent/expired.
	Get(ctx context.Context, dedupKey string) (uuid.UUID, error)
	// Remember associates dedup key with alert id for the cooldown duration.
	Remember(ctx context.Context, dedupKey string, alertID uuid.UUID, cooldown time.Duration) error
}

type memoryCooldown struct {
	mu      sync.Mutex
	entries map[string]cooldownEntry
}

type cooldownEntry struct {
	alertID uuid.UUID
	expires time.Time
}

func NewMemoryCooldownStore() CooldownStore {
	return &memoryCooldown{entries: make(map[string]cooldownEntry)}
}

func (m *memoryCooldown) Get(_ context.Context, dedupKey string) (uuid.UUID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	e, ok := m.entries[dedupKey]
	if !ok || time.Now().After(e.expires) {
		delete(m.entries, dedupKey)
		return uuid.Nil, nil
	}
	return e.alertID, nil
}

func (m *memoryCooldown) Remember(_ context.Context, dedupKey string, alertID uuid.UUID, cooldown time.Duration) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.entries[dedupKey] = cooldownEntry{alertID: alertID, expires: time.Now().Add(cooldown)}
	return nil
}

type redisCooldown struct {
	client    *redis.Client
	keyPrefix string
}

func NewRedisCooldownStore(client *redis.Client, keyPrefix string) CooldownStore {
	if keyPrefix == "" {
		keyPrefix = "sentinel:alert:dedup:"
	}
	return &redisCooldown{client: client, keyPrefix: keyPrefix}
}

func (r *redisCooldown) Get(ctx context.Context, dedupKey string) (uuid.UUID, error) {
	val, err := r.client.Get(ctx, r.keyPrefix+dedupKey).Result()
	if err == redis.Nil {
		return uuid.Nil, nil
	}
	if err != nil {
		return uuid.Nil, err
	}
	id, err := uuid.Parse(val)
	if err != nil {
		return uuid.Nil, nil
	}
	return id, nil
}

func (r *redisCooldown) Remember(ctx context.Context, dedupKey string, alertID uuid.UUID, cooldown time.Duration) error {
	return r.client.Set(ctx, r.keyPrefix+dedupKey, alertID.String(), cooldown).Err()
}

// NewCooldownFromRedisURL returns Redis-backed cooldown or in-memory fallback.
func NewCooldownFromRedisURL(redisURL string) (CooldownStore, func() error, error) {
	if redisURL == "" {
		return NewMemoryCooldownStore(), func() error { return nil }, nil
	}
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return NewMemoryCooldownStore(), func() error { return nil }, nil
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return NewMemoryCooldownStore(), func() error { return nil }, nil
	}
	return NewRedisCooldownStore(client, ""), client.Close, nil
}
