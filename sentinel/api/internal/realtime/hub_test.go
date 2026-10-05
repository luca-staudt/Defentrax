package realtime_test

import (
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/realtime"
)

func TestHubPublishRecentSubscribe(t *testing.T) {
	hub := realtime.NewHub(3)
	id := uuid.New()
	ev := realtime.AlertEvent{
		Type:     "alert_open",
		AlertID:  id,
		Severity: "high",
		Title:    "test",
	}

	ch := hub.Subscribe()
	defer hub.Unsubscribe(ch)

	hub.Publish(ev)

	select {
	case got := <-ch:
		if got.AlertID != id || got.Title != "test" {
			t.Fatalf("unexpected event: %+v", got)
		}
	case <-time.After(time.Second):
		t.Fatal("timeout waiting for subscribed event")
	}

	recent := hub.Recent(10)
	if len(recent) != 1 {
		t.Fatalf("expected 1 recent event, got %d", len(recent))
	}

	for i := 0; i < 5; i++ {
		hub.Publish(realtime.AlertEvent{Type: "tick", AlertID: uuid.New()})
	}
	recent = hub.Recent(2)
	if len(recent) != 2 {
		t.Fatalf("expected cap at 2 recent, got %d", len(recent))
	}
}

func TestHubNonBlockingSubscriber(t *testing.T) {
	hub := realtime.NewHub(8)
	ch := hub.Subscribe()
	defer hub.Unsubscribe(ch)

	// Fill the subscriber buffer (16) plus one extra publish must not deadlock Publish.
	for i := 0; i < 20; i++ {
		hub.Publish(realtime.AlertEvent{Type: "flood", AlertID: uuid.New()})
	}
	recent := hub.Recent(20)
	if len(recent) != 8 {
		t.Fatalf("expected maxRecent=8 in buffer, got %d", len(recent))
	}
	_ = ch
}
