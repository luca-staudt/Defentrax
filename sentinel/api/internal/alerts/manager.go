package alerts

import (
	"context"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/notify"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/realtime"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/detection"
)

// Notifier is implemented by notify.Dispatcher (optional).
type Notifier interface {
	Notify(ctx context.Context, ev notify.AlertEvent)
}

// MatchInput is one detection match ready for alert deduplication.
type MatchInput struct {
	Match      detection.MatchResult
	RuleDBID   uuid.UUID
	OccurredAt time.Time
}

// AlertStore persists alerts (implemented by store package and test doubles).
type AlertStore interface {
	GetActiveAlertByDedupKey(ctx context.Context, dedupKey string) (*store.Alert, error)
	GetAlertByID(ctx context.Context, id uuid.UUID) (*store.Alert, error)
	CreateAlert(ctx context.Context, p store.AlertCreateParams) (uuid.UUID, error)
	AggregateAlert(ctx context.Context, alertID uuid.UUID, lastSeen time.Time, triggerEventID uuid.UUID) error
}

type poolAlertStore struct {
	pool *pgxpool.Pool
}

func (p poolAlertStore) GetActiveAlertByDedupKey(ctx context.Context, dedupKey string) (*store.Alert, error) {
	return store.GetActiveAlertByDedupKey(ctx, p.pool, dedupKey)
}

func (p poolAlertStore) GetAlertByID(ctx context.Context, id uuid.UUID) (*store.Alert, error) {
	return store.GetAlertByID(ctx, p.pool, id)
}

func (p poolAlertStore) CreateAlert(ctx context.Context, params store.AlertCreateParams) (uuid.UUID, error) {
	return store.CreateAlert(ctx, p.pool, params)
}

func (p poolAlertStore) AggregateAlert(ctx context.Context, alertID uuid.UUID, lastSeen time.Time, triggerEventID uuid.UUID) error {
	return store.AggregateAlert(ctx, p.pool, alertID, lastSeen, triggerEventID)
}

// NewManagerFromPool wires the production store backend.
func NewManagerFromPool(log *slog.Logger, pool *pgxpool.Pool, cooldown CooldownStore, cooldownDur time.Duration, hub *realtime.Hub) *Manager {
	return &Manager{
		Log:              log,
		Store:            poolAlertStore{pool: pool},
		CooldownStore:    cooldown,
		CooldownDuration: cooldownDur,
		Hub:              hub,
	}
}

// Manager creates or aggregates alerts from detection matches.
type Manager struct {
	Log              *slog.Logger
	Store            AlertStore
	CooldownStore    CooldownStore
	CooldownDuration time.Duration
	Hub              *realtime.Hub
	Notifier         Notifier
}

// HandleMatch returns alert id and whether a new alert was created (false when aggregated).
func (m *Manager) HandleMatch(ctx context.Context, in MatchInput) (uuid.UUID, bool, error) {
	dedupKey := detection.AlertDedupKey(in.Match.RuleID, in.Match.ServerID, in.Match.Group)
	sourceIP := in.Match.Group["src_ip"]
	if sourceIP == "" {
		if v, ok := in.Match.Group["source_ip"]; ok {
			sourceIP = v
		}
	}

	existing, err := m.findExisting(ctx, dedupKey)
	if err != nil {
		return uuid.Nil, false, err
	}
	if existing != nil {
		if err := m.Store.AggregateAlert(ctx, existing.ID, in.OccurredAt, in.Match.EventID); err != nil {
			return uuid.Nil, false, err
		}
		_ = m.CooldownStore.Remember(ctx, dedupKey, existing.ID, m.cooldownDur())
		count := existing.EventCount + 1
		m.publishUpdated(existing.ID, existing.ServerID, existing.Status, existing.Severity, existing.Title, count)
		m.notify(ctx, notify.AlertEvent{
			AlertID:     existing.ID,
			ServerID:    existing.ServerID,
			Title:       existing.Title,
			Description: existing.Description,
			Severity:    existing.Severity,
			Status:      existing.Status,
			SourceIP:    existing.SourceIP,
			EventCount:  count,
			Trigger:     notify.TriggerAlertUpdated,
			OccurredAt:  in.OccurredAt,
		})
		return existing.ID, false, nil
	}

	id, err := m.Store.CreateAlert(ctx, store.AlertCreateParams{
		ServerID:    in.Match.ServerID,
		RuleID:      in.RuleDBID,
		Title:       in.Match.Title,
		Description: in.Match.Description,
		Severity:    in.Match.Severity,
		DedupKey:    dedupKey,
		SourceIP:    sourceIP,
		EventID:     in.Match.EventID,
		OccurredAt:  in.OccurredAt,
	})
	if err != nil {
		return uuid.Nil, false, err
	}
	_ = m.CooldownStore.Remember(ctx, dedupKey, id, m.cooldownDur())
	m.publishCreated(id, in.Match.ServerID, in.Match.Severity, in.Match.Title)
	m.notify(ctx, notify.AlertEvent{
		AlertID:     id,
		ServerID:    in.Match.ServerID,
		Title:       in.Match.Title,
		Description: in.Match.Description,
		Severity:    in.Match.Severity,
		Status:      StatusOpen,
		SourceIP:    sourceIP,
		EventCount:  1,
		Trigger:     notify.TriggerAlertCreated,
		OccurredAt:  in.OccurredAt,
	})
	return id, true, nil
}

func (m *Manager) notify(ctx context.Context, ev notify.AlertEvent) {
	if m.Notifier == nil {
		return
	}
	m.Notifier.Notify(ctx, ev)
}

func (m *Manager) findExisting(ctx context.Context, dedupKey string) (*store.Alert, error) {
	if id, err := m.CooldownStore.Get(ctx, dedupKey); err != nil {
		return nil, err
	} else if id != uuid.Nil {
		a, err := m.Store.GetAlertByID(ctx, id)
		if err == nil && a.Status != StatusResolved {
			return a, nil
		}
	}
	return m.Store.GetActiveAlertByDedupKey(ctx, dedupKey)
}

func (m *Manager) cooldownDur() time.Duration {
	if m.CooldownDuration > 0 {
		return m.CooldownDuration
	}
	return 15 * time.Minute
}

func (m *Manager) publishCreated(id, serverID uuid.UUID, severity, title string) {
	if m.Hub == nil {
		return
	}
	m.Hub.Publish(realtime.AlertEvent{
		Type:     "alert.created",
		AlertID:  id,
		ServerID: serverID,
		Status:   StatusOpen,
		Severity: severity,
		Title:    title,
		EventCount: 1,
	})
}

func (m *Manager) publishUpdated(id, serverID uuid.UUID, status, severity, title string, eventCount int) {
	if m.Hub == nil {
		return
	}
	m.Hub.Publish(realtime.AlertEvent{
		Type:       "alert.updated",
		AlertID:    id,
		ServerID:   serverID,
		Status:     status,
		Severity:   severity,
		Title:      title,
		EventCount: eventCount,
	})
}
