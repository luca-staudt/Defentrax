package realtime

import (
	"sync"
	"time"

	"github.com/google/uuid"
)

// AlertEvent is a minimal alert notification for dashboards (Phase 9 will consume via WebSocket).
type AlertEvent struct {
	Type      string    `json:"type"`
	AlertID   uuid.UUID `json:"alert_id"`
	ServerID  uuid.UUID `json:"server_id,omitempty"`
	Status    string    `json:"status,omitempty"`
	Severity  string    `json:"severity,omitempty"`
	Title     string    `json:"title,omitempty"`
	EventCount int      `json:"event_count,omitempty"`
	At        time.Time `json:"at"`
}

// Hub buffers recent alert events and supports optional subscribers (stub for live WS).
type Hub struct {
	mu       sync.RWMutex
	recent   []AlertEvent
	maxRecent int
	subs     map[chan AlertEvent]struct{}
}

func NewHub(maxRecent int) *Hub {
	if maxRecent < 1 {
		maxRecent = 128
	}
	return &Hub{
		recent:    make([]AlertEvent, 0, maxRecent),
		maxRecent: maxRecent,
		subs:      make(map[chan AlertEvent]struct{}),
	}
}

func (h *Hub) Publish(ev AlertEvent) {
	if ev.At.IsZero() {
		ev.At = time.Now().UTC()
	}
	h.mu.Lock()
	h.recent = append(h.recent, ev)
	if len(h.recent) > h.maxRecent {
		h.recent = h.recent[len(h.recent)-h.maxRecent:]
	}
	subs := make([]chan AlertEvent, 0, len(h.subs))
	for ch := range h.subs {
		subs = append(subs, ch)
	}
	h.mu.Unlock()
	for _, ch := range subs {
		select {
		case ch <- ev:
		default:
		}
	}
}

// Recent returns a copy of buffered events (newest last).
func (h *Hub) Recent(limit int) []AlertEvent {
	h.mu.RLock()
	defer h.mu.RUnlock()
	if limit <= 0 || limit > len(h.recent) {
		limit = len(h.recent)
	}
	start := len(h.recent) - limit
	out := make([]AlertEvent, limit)
	copy(out, h.recent[start:])
	return out
}

// Subscribe registers a consumer channel; caller must call Unsubscribe when done.
func (h *Hub) Subscribe() chan AlertEvent {
	ch := make(chan AlertEvent, 16)
	h.mu.Lock()
	h.subs[ch] = struct{}{}
	h.mu.Unlock()
	return ch
}

func (h *Hub) Unsubscribe(ch chan AlertEvent) {
	h.mu.Lock()
	delete(h.subs, ch)
	h.mu.Unlock()
}
