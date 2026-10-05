package ratelimit

import (
	"context"
	"sync"
	"time"

	"github.com/redis/go-redis/v9"
)

// Limiter checks whether a key exceeded max attempts within window.
type Limiter interface {
	Allow(ctx context.Context, key string) (allowed bool, err error)
}

type memoryEntry struct {
	count   int
	resetAt time.Time
}

// Memory is a process-local fallback when Redis is unavailable.
type Memory struct {
	mu      sync.Mutex
	entries map[string]memoryEntry
	max     int
	window  time.Duration
}

func NewMemory(max int, window time.Duration) *Memory {
	return &Memory{entries: make(map[string]memoryEntry), max: max, window: window}
}

func (m *Memory) Allow(_ context.Context, key string) (bool, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	now := time.Now()
	e, ok := m.entries[key]
	if !ok || now.After(e.resetAt) {
		m.entries[key] = memoryEntry{count: 1, resetAt: now.Add(m.window)}
		return true, nil
	}
	if e.count >= m.max {
		return false, nil
	}
	e.count++
	m.entries[key] = e
	return true, nil
}

// Redis implements fixed-window counter using INCR + EXPIRE.
type Redis struct {
	client    *redis.Client
	max       int
	window    time.Duration
	keyPrefix string
}

func NewRedis(client *redis.Client, max int, window time.Duration, keyPrefix string) *Redis {
	if keyPrefix == "" {
		keyPrefix = "sentinel:rl:"
	}
	return &Redis{client: client, max: max, window: window, keyPrefix: keyPrefix}
}

func (r *Redis) Allow(ctx context.Context, key string) (bool, error) {
	k := r.keyPrefix + key
	n, err := r.client.Incr(ctx, k).Result()
	if err != nil {
		return false, err
	}
	if n == 1 {
		_ = r.client.Expire(ctx, k, r.window).Err()
	}
	return n <= int64(r.max), nil
}

func NewFromConfig(redisURL string, max int, window time.Duration, redisKeyPrefix string) (Limiter, func() error, error) {
	if redisURL == "" {
		return NewMemory(max, window), func() error { return nil }, nil
	}
	opts, err := redis.ParseURL(redisURL)
	if err != nil {
		return NewMemory(max, window), func() error { return nil }, nil
	}
	client := redis.NewClient(opts)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		_ = client.Close()
		return NewMemory(max, window), func() error { return nil }, nil
	}
	return NewRedis(client, max, window, redisKeyPrefix), client.Close, nil
}
