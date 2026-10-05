package detection

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// WindowCounter tracks event counts in a time-bounded window for threshold rules.
type WindowCounter interface {
	Increment(ctx context.Context, key string, window time.Duration) (count int64, err error)
}

type memoryWindow struct {
	mu      sync.Mutex
	entries map[string]windowEntry
}

type windowEntry struct {
	count   int64
	resetAt time.Time
}

func NewMemoryWindowCounter() WindowCounter {
	return &memoryWindow{entries: make(map[string]windowEntry)}
}

func (m *memoryWindow) Increment(_ context.Context, key string, window time.Duration) (int64, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	e, ok := m.entries[key]
	if !ok || now.After(e.resetAt) {
		e = windowEntry{count: 1, resetAt: now.Add(window)}
		m.entries[key] = e
		return 1, nil
	}
	e.count++
	m.entries[key] = e
	return e.count, nil
}

// RedisWindowCounter uses INCR + EXPIRE for distributed fixed windows.
type RedisWindowCounter struct {
	client    *redis.Client
	keyPrefix string
}

func NewRedisWindowCounter(client *redis.Client, keyPrefix string) *RedisWindowCounter {
	if keyPrefix == "" {
		keyPrefix = "sentinel:detect:"
	}
	return &RedisWindowCounter{client: client, keyPrefix: keyPrefix}
}

func (r *RedisWindowCounter) Increment(ctx context.Context, key string, window time.Duration) (int64, error) {
	k := r.keyPrefix + key
	n, err := r.client.Incr(ctx, k).Result()
	if err != nil {
		return 0, err
	}
	if n == 1 {
		_ = r.client.Expire(ctx, k, window).Err()
	}
	return n, nil
}

func NewWindowCounterFromRedisURL(redisURL string) (WindowCounter, func() error, error) {
	if redisURL == "" {
		return NewMemoryWindowCounter(), func() error { return nil }, nil
	}
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return NewMemoryWindowCounter(), func() error { return nil }, nil
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return NewMemoryWindowCounter(), func() error { return nil }, nil
	}
	return NewRedisWindowCounter(client, "sentinel:detect:"), client.Close, nil
}
