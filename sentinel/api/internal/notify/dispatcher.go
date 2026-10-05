package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
)

// Dispatcher matches notification rules and delivers alerts with retry/backoff.
type Dispatcher struct {
	Log         *slog.Logger
	Pool        *pgxpool.Pool
	SecretsKey  []byte
	Webhooks    *WebhookSender
	Email       *EmailSender
	MaxAttempts int
	BaseBackoff time.Duration
	MaxBackoff  time.Duration
	Async       bool // when true, Notify returns immediately and work runs in a goroutine

	mu     sync.Mutex
	wg     sync.WaitGroup
	closed bool
}

// NewDispatcher constructs a production dispatcher.
func NewDispatcher(log *slog.Logger, pool *pgxpool.Pool, secretsKey []byte) *Dispatcher {
	return &Dispatcher{
		Log:         log,
		Pool:        pool,
		SecretsKey:  secretsKey,
		Webhooks:    &WebhookSender{},
		Email:       &EmailSender{},
		MaxAttempts: DefaultMaxAttempts,
		BaseBackoff: DefaultBaseDelay,
		MaxBackoff:  DefaultMaxDelay,
		Async:       true,
	}
}

// Close waits for in-flight async notifications.
func (d *Dispatcher) Close() {
	d.mu.Lock()
	d.closed = true
	d.mu.Unlock()
	d.wg.Wait()
}

// Notify evaluates rules for an alert event and enqueues deliveries.
func (d *Dispatcher) Notify(ctx context.Context, ev AlertEvent) {
	if d == nil || d.Pool == nil {
		return
	}
	if d.Async {
		d.mu.Lock()
		if d.closed {
			d.mu.Unlock()
			return
		}
		d.wg.Add(1)
		d.mu.Unlock()
		go func() {
			defer d.wg.Done()
			bg, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
			defer cancel()
			d.dispatch(bg, ev)
		}()
		return
	}
	d.dispatch(ctx, ev)
}

func (d *Dispatcher) dispatch(ctx context.Context, ev AlertEvent) {
	rules, err := store.ListEnabledNotificationRules(ctx, d.Pool)
	if err != nil {
		d.log().Error("list notification rules failed", "error", err)
		return
	}
	channelSeen := map[uuid.UUID]struct{}{}
	for _, rule := range rules {
		if !MeetsMin(ev.Severity, rule.MinSeverity) {
			continue
		}
		if !ruleHasTrigger(rule.Triggers, ev.Trigger) {
			continue
		}
		for _, chID := range rule.ChannelIDs {
			if _, ok := channelSeen[chID]; ok {
				continue
			}
			channelSeen[chID] = struct{}{}
			d.deliverToChannel(ctx, chID, ev)
		}
	}
}

func ruleHasTrigger(triggers []string, want string) bool {
	for _, t := range triggers {
		if t == want {
			return true
		}
	}
	return false
}

func (d *Dispatcher) deliverToChannel(ctx context.Context, channelID uuid.UUID, ev AlertEvent) {
	ch, err := store.GetNotificationChannel(ctx, d.Pool, channelID)
	if err != nil {
		d.log().Warn("notification channel missing", "channel_id", channelID, "error", err)
		return
	}
	if !ch.Enabled {
		return
	}

	payload, err := json.Marshal(ev)
	if err != nil {
		d.log().Error("marshal notification payload failed", "error", err)
		return
	}
	deliveryID, err := store.CreateNotificationDelivery(ctx, d.Pool, store.DeliveryCreateParams{
		AlertID:      ev.AlertID,
		ChannelID:    channelID,
		Payload:      payload,
		TriggerEvent: ev.Trigger,
	})
	if err != nil {
		d.log().Error("create notification delivery failed", "error", err, "channel_id", channelID)
		return
	}

	d.retryUntilDone(ctx, deliveryID, ch, ev, 1)
}

// retryUntilDone performs attempts with backoff until success, exhaustion, or context cancel.
func (d *Dispatcher) retryUntilDone(ctx context.Context, deliveryID uuid.UUID, ch store.NotificationChannel, ev AlertEvent, startAttempt int) {
	maxAttempts := d.MaxAttempts
	if maxAttempts < 1 {
		maxAttempts = DefaultMaxAttempts
	}
	for attempt := startAttempt; attempt <= maxAttempts; attempt++ {
		ok := d.attemptOnce(ctx, deliveryID, ch, ev, attempt, maxAttempts, false)
		if ok {
			return
		}
		if attempt >= maxAttempts {
			return
		}
		delay := Backoff(attempt, d.BaseBackoff, d.MaxBackoff)
		timer := time.NewTimer(delay)
		select {
		case <-ctx.Done():
			timer.Stop()
			// Leave pending with next_attempt_at=now so the background retrier can resume.
			t := time.Now().UTC()
			_ = store.MarkNotificationFailed(ctx, d.Pool, deliveryID, attempt, "delivery interrupted", &t, false)
			return
		case <-timer.C:
		}
	}
}

// attemptOnce performs a single delivery attempt. Returns true when sent.
// When scheduleRetry is false (inline retry loop), intermediate failures stay pending without
// a next_attempt_at to avoid races with ProcessPending.
func (d *Dispatcher) attemptOnce(ctx context.Context, deliveryID uuid.UUID, ch store.NotificationChannel, ev AlertEvent, attempt, maxAttempts int, scheduleRetry bool) bool {
	err := d.send(ctx, ch, ev)
	if err == nil {
		_ = store.MarkNotificationSent(ctx, d.Pool, deliveryID, attempt)
		d.log().Info("notification sent",
			"delivery_id", deliveryID,
			"channel_id", ch.ID,
			"channel_type", ch.ChannelType,
			"alert_id", ev.AlertID,
			"attempt", attempt,
		)
		return true
	}

	safe := SafeError(err)
	final := attempt >= maxAttempts
	var next *time.Time
	if !final && scheduleRetry {
		delay := Backoff(attempt, d.BaseBackoff, d.MaxBackoff)
		t := time.Now().UTC().Add(delay)
		next = &t
	}
	_ = store.MarkNotificationFailed(ctx, d.Pool, deliveryID, attempt, safe, next, final)

	meta := map[string]any{
		"channel_id":   ch.ID.String(),
		"channel_type": ch.ChannelType,
		"channel_name": ch.Name,
		"alert_id":     ev.AlertID.String(),
		"attempt":      attempt,
		"final":        final,
		"error":        safe,
	}
	_ = store.Audit(ctx, d.Pool, nil, "system", "notification.failed", "notification", &deliveryID, meta, nil, "")

	d.log().Warn("notification delivery failed",
		"delivery_id", deliveryID,
		"channel_id", ch.ID,
		"channel_type", ch.ChannelType,
		"alert_id", ev.AlertID,
		"attempt", attempt,
		"final", final,
		"error", safe,
	)
	return false
}

func (d *Dispatcher) send(ctx context.Context, ch store.NotificationChannel, ev AlertEvent) error {
	secrets, err := DecryptSecrets(d.SecretsKey, ch.SecretsEncrypted)
	if err != nil {
		return err
	}
	switch ch.ChannelType {
	case ChannelDiscord:
		return d.webhooks().SendDiscord(ctx, secrets.WebhookURL, ev)
	case ChannelSlack:
		return d.webhooks().SendSlack(ctx, secrets.WebhookURL, ev)
	case ChannelWebhook:
		return d.webhooks().SendGeneric(ctx, secrets.WebhookURL, secrets.Headers, ev)
	case ChannelEmail:
		cfg, err := ParseEmailConfig(ch.Config)
		if err != nil {
			return err
		}
		return d.email().SendEmail(ctx, cfg, secrets.SMTPPassword, ev)
	default:
		return errUnknownChannel(ch.ChannelType)
	}
}

// SendTest delivers a synthetic alert once to a channel (no delivery row, no retry).
func (d *Dispatcher) SendTest(ctx context.Context, ch store.NotificationChannel) error {
	if d == nil {
		return fmt.Errorf("notification dispatcher unavailable")
	}
	ev := AlertEvent{
		AlertID:     uuid.New(),
		Title:       "Sentinel test notification",
		Description: "This is a test message from the Sentinel notifications UI.",
		Severity:    SeverityInfo,
		Status:      "open",
		EventCount:  1,
		Trigger:     "channel.test",
		OccurredAt:  time.Now().UTC(),
	}
	return d.send(ctx, ch, ev)
}

func errUnknownChannel(t string) error {
	return &channelTypeError{Type: t}
}

type channelTypeError struct{ Type string }

func (e *channelTypeError) Error() string {
	return "unknown channel type: " + e.Type
}

func (d *Dispatcher) webhooks() *WebhookSender {
	if d.Webhooks != nil {
		return d.Webhooks
	}
	return &WebhookSender{}
}

func (d *Dispatcher) email() *EmailSender {
	if d.Email != nil {
		return d.Email
	}
	return &EmailSender{}
}

func (d *Dispatcher) log() *slog.Logger {
	if d.Log != nil {
		return d.Log
	}
	return slog.Default()
}

// ProcessPending retries deliveries that are due (for a background poller).
func (d *Dispatcher) ProcessPending(ctx context.Context, limit int) int {
	if d == nil || d.Pool == nil {
		return 0
	}
	rows, err := store.ListPendingNotificationDeliveries(ctx, d.Pool, limit)
	if err != nil {
		d.log().Error("list pending notifications failed", "error", err)
		return 0
	}
	n := 0
	for _, row := range rows {
		ch, err := store.GetNotificationChannel(ctx, d.Pool, row.ChannelID)
		if err != nil {
			continue
		}
		var ev AlertEvent
		if len(row.Payload) > 0 {
			_ = json.Unmarshal(row.Payload, &ev)
		}
		if ev.AlertID == uuid.Nil {
			ev.AlertID = row.AlertID
		}
		if ev.Trigger == "" {
			ev.Trigger = row.TriggerEvent
		}
		attempt := row.AttemptCount + 1
		if attempt < 1 {
			attempt = 1
		}
		maxAttempts := d.MaxAttempts
		if maxAttempts < 1 {
			maxAttempts = DefaultMaxAttempts
		}
		d.attemptOnce(ctx, row.ID, ch, ev, attempt, maxAttempts, true)
		n++
	}
	return n
}
