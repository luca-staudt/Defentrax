package alerts_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/alerts"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/detection"
)

type memAlertStore struct {
	mu      sync.Mutex
	byDedup map[string]*store.Alert
	byID    map[uuid.UUID]*store.Alert
	created int
	aggs    int
}

func newMemAlertStore() *memAlertStore {
	return &memAlertStore{
		byDedup: make(map[string]*store.Alert),
		byID:    make(map[uuid.UUID]*store.Alert),
	}
}

func (m *memAlertStore) GetActiveAlertByDedupKey(_ context.Context, dedupKey string) (*store.Alert, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.byDedup[dedupKey]
	if !ok || a.Status == alerts.StatusResolved {
		return nil, nil
	}
	copy := *a
	return &copy, nil
}

func (m *memAlertStore) GetAlertByID(_ context.Context, id uuid.UUID) (*store.Alert, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.byID[id]
	if !ok {
		return nil, store.ErrNotFound
	}
	copy := *a
	return &copy, nil
}

func (m *memAlertStore) CreateAlert(_ context.Context, p store.AlertCreateParams) (uuid.UUID, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	id := uuid.New()
	now := p.OccurredAt
	if now.IsZero() {
		now = time.Now().UTC()
	}
	a := &store.Alert{
		ID:          id,
		ServerID:    p.ServerID,
		RuleID:      p.RuleID,
		Title:       p.Title,
		Description: p.Description,
		Status:      alerts.StatusOpen,
		Severity:    p.Severity,
		DedupKey:    p.DedupKey,
		SourceIP:    p.SourceIP,
		EventCount:  1,
		FirstSeenAt: now,
		LastSeenAt:  now,
		OpenedAt:    now,
	}
	m.byID[id] = a
	m.byDedup[p.DedupKey] = a
	m.created++
	return id, nil
}

func (m *memAlertStore) AggregateAlert(_ context.Context, alertID uuid.UUID, lastSeen time.Time, _ uuid.UUID) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	a, ok := m.byID[alertID]
	if !ok {
		return store.ErrNotFound
	}
	a.EventCount++
	a.LastSeenAt = lastSeen
	m.aggs++
	return nil
}

func TestManagerDedup100EventsOneAlert(t *testing.T) {
	mem := newMemAlertStore()
	mgr := &alerts.Manager{
		Store:            mem,
		CooldownStore:    alerts.NewMemoryCooldownStore(),
		CooldownDuration: time.Hour,
	}
	serverID := uuid.New()
	ruleDB := uuid.New()
	group := map[string]string{"src_ip": "203.0.113.10"}
	for i := 0; i < 100; i++ {
		_, _, err := mgr.HandleMatch(context.Background(), alerts.MatchInput{
			Match: detection.MatchResult{
				RuleID:      "ssh.possible-brute-force",
				Severity:    "high",
				Title:       "Possible SSH brute-force from 203.0.113.10",
				Description: "test",
				ServerID:    serverID,
				EventID:     uuid.New(),
				Group:       group,
			},
			RuleDBID:   ruleDB,
			OccurredAt: time.Now().UTC(),
		})
		if err != nil {
			t.Fatalf("match %d: %v", i, err)
		}
	}
	if mem.created != 1 {
		t.Fatalf("expected 1 created alert, got %d", mem.created)
	}
	if mem.aggs != 99 {
		t.Fatalf("expected 99 aggregations, got %d", mem.aggs)
	}
	var only *store.Alert
	for _, a := range mem.byID {
		only = a
	}
	if only == nil || only.EventCount != 100 {
		t.Fatalf("expected single alert with event_count 100, got %+v", only)
	}
}
