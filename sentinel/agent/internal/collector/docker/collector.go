package docker

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"sync"
	"time"

	"github.com/luca-staudt/Defentrax/sentinel/pkg/event"
)

// Collector streams Docker Engine events and converts them to canonical events.
// It is observe-only: it never starts, stops, isolates, or deletes containers/images.
type Collector struct {
	API  API
	Host string

	mu     sync.Mutex
	since  time.Time
	buffer []event.CanonicalEvent
}

// NewCollector constructs a collector that starts streaming from "now".
func NewCollector(api API, host string) *Collector {
	return &Collector{
		API:   api,
		Host:  host,
		since: time.Now().UTC().Add(-time.Second),
	}
}

// Run streams Docker events until ctx is cancelled. Safe to call once.
// Events are buffered for Drain; callers should Drain periodically and ingest.
func (c *Collector) Run(ctx context.Context) error {
	if c.API == nil {
		return errors.New("docker collector: API client is nil")
	}
	backoff := time.Second
	for {
		if ctx.Err() != nil {
			return ctx.Err()
		}
		err := c.streamOnce(ctx)
		if ctx.Err() != nil {
			return ctx.Err()
		}
		if err != nil && !errors.Is(err, io.EOF) && !errors.Is(err, context.Canceled) {
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
			continue
		}
		backoff = time.Second
	}
}

func (c *Collector) streamOnce(ctx context.Context) error {
	c.mu.Lock()
	since := c.since
	c.mu.Unlock()

	body, err := c.API.Events(ctx, since)
	if err != nil {
		return err
	}
	defer body.Close()

	sc := bufio.NewScanner(body)
	sc.Buffer(make([]byte, 64*1024), 1024*1024)
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		ev, ok, err := c.convertLine(ctx, append([]byte(nil), line...))
		if err != nil || !ok {
			continue
		}
		c.mu.Lock()
		c.buffer = append(c.buffer, ev)
		if t := ev.OccurredAt; t.After(c.since) {
			c.since = t
		}
		c.mu.Unlock()
	}
	if err := sc.Err(); err != nil {
		return err
	}
	return io.EOF
}

func (c *Collector) convertLine(ctx context.Context, raw []byte) (event.CanonicalEvent, bool, error) {
	var eng EngineEvent
	if err := json.Unmarshal(raw, &eng); err != nil {
		return event.CanonicalEvent{}, false, err
	}

	var flags *RiskFlags
	typ := eng.Type
	action := eng.Action
	if action == "" {
		action = eng.Status
	}
	if needsInspect(typ, action) {
		id := eng.Actor.ID
		if id == "" {
			id = eng.ID
		}
		if id != "" {
			if insp, err := c.API.InspectContainer(ctx, id); err == nil {
				f := DeriveRiskFlags(insp)
				flags = &f
			}
			// Missing inspect (container already gone) is fine — emit without risk flags.
		}
	}
	return EngineEventToCanonical(eng, raw, c.Host, time.Now().UTC(), flags)
}

// Drain returns and clears buffered events (for batch ingest).
func (c *Collector) Drain() []event.CanonicalEvent {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.buffer) == 0 {
		return nil
	}
	out := c.buffer
	c.buffer = nil
	return out
}

// ParseLines is a pure helper for tests/fixtures: each non-empty line is one event JSON.
// Optional inspectJSON is applied to create/start events when provided.
func ParseLines(lines [][]byte, host string, now time.Time, inspectByID map[string]*ContainerInspect) ([]event.CanonicalEvent, error) {
	var out []event.CanonicalEvent
	for _, line := range lines {
		if len(line) == 0 {
			continue
		}
		var eng EngineEvent
		if err := json.Unmarshal(line, &eng); err != nil {
			return nil, err
		}
		var flags *RiskFlags
		if needsInspect(eng.Type, firstNonEmpty(eng.Action, eng.Status)) && inspectByID != nil {
			id := firstNonEmpty(eng.Actor.ID, eng.ID)
			if insp, ok := inspectByID[id]; ok {
				f := DeriveRiskFlags(insp)
				flags = &f
			} else if len(id) >= 12 {
				if insp, ok := inspectByID[id[:12]]; ok {
					f := DeriveRiskFlags(insp)
					flags = &f
				}
			}
		}
		ev, ok, err := EngineEventToCanonical(eng, line, host, now, flags)
		if err != nil {
			return nil, err
		}
		if ok {
			out = append(out, ev)
		}
	}
	return out, nil
}

func needsInspect(typ, action string) bool {
	if typ != "container" {
		return false
	}
	a := action
	if i := len(a); i > 0 {
		for j := 0; j < i; j++ {
			if a[j] == ':' {
				a = a[:j]
				break
			}
		}
	}
	switch a {
	case "create", "start":
		return true
	default:
		return false
	}
}
