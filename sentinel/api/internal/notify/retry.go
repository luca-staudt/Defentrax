package notify

import "time"

const (
	DefaultMaxAttempts = 5
	DefaultBaseDelay   = 500 * time.Millisecond
	DefaultMaxDelay    = 30 * time.Second
)

// Backoff returns the delay before the next attempt (1-based attempt number after a failure).
func Backoff(attempt int, base, max time.Duration) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	if base <= 0 {
		base = DefaultBaseDelay
	}
	if max <= 0 {
		max = DefaultMaxDelay
	}
	d := base
	for i := 1; i < attempt; i++ {
		if d >= max/2 {
			return max
		}
		d *= 2
	}
	if d > max {
		return max
	}
	return d
}
