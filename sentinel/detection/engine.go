package detection

import (
	"context"
	"sync"
	"time"

	"github.com/google/uuid"
)

// MatchResult is produced when a rule fires for an event.
type MatchResult struct {
	RuleID      string
	RuleName    string
	Severity    string
	Title       string
	Description string
	ServerID    uuid.UUID
	EventID     uuid.UUID
	Group       map[string]string
}

// Engine evaluates loaded rules against events.
type Engine struct {
	mu      sync.RWMutex
	rules   []Rule
	enabled map[string]bool // keyed by rule YAML id
	counter WindowCounter
}

func NewEngine(counter WindowCounter) *Engine {
	if counter == nil {
		counter = NewMemoryWindowCounter()
	}
	return &Engine{
		enabled: make(map[string]bool),
		counter: counter,
	}
}

// SetRules replaces the in-memory rule set (typically after load + DB enable flags).
func (e *Engine) SetRules(rules []Rule, enabledByID map[string]bool) {
	e.mu.Lock()
	defer e.mu.Unlock()
	e.rules = append([]Rule(nil), rules...)
	e.enabled = make(map[string]bool, len(enabledByID))
	for k, v := range enabledByID {
		e.enabled[k] = v
	}
}

// Rules returns a copy of loaded rules.
func (e *Engine) Rules() []Rule {
	e.mu.RLock()
	defer e.mu.RUnlock()
	out := make([]Rule, len(e.rules))
	copy(out, e.rules)
	return out
}

// Evaluate runs all enabled rules against one event.
func (e *Engine) Evaluate(ctx context.Context, ev Event) ([]MatchResult, error) {
	e.mu.RLock()
	rules := e.rules
	enabled := e.enabled
	e.mu.RUnlock()

	var results []MatchResult
	for _, rule := range rules {
		on, ok := enabled[rule.ID]
		if ok && !on {
			continue
		}
		if !MatchesCondition(rule.Condition, ev) {
			continue
		}
		group := groupKeyValues(rule, ev)
		if rule.Threshold == nil || rule.Threshold.Count < 2 {
			results = append(results, e.buildMatch(rule, ev, group))
			continue
		}
		window := time.Duration(rule.Threshold.WindowSeconds) * time.Second
		key := windowKey(rule.ID, ev.ServerID.String(), group)
		count, err := e.counter.Increment(ctx, key, window)
		if err != nil {
			return nil, err
		}
		if count >= int64(rule.Threshold.Count) && count == int64(rule.Threshold.Count) {
			results = append(results, e.buildMatch(rule, ev, group))
		}
	}
	return results, nil
}

func (e *Engine) buildMatch(rule Rule, ev Event, group map[string]string) MatchResult {
	title := renderTemplate(rule.Action.Title, ev, group)
	desc := renderTemplate(rule.Action.Description, ev, group)
	if desc == "" {
		desc = rule.Description
	}
	return MatchResult{
		RuleID:      rule.ID,
		RuleName:    rule.Name,
		Severity:    rule.Severity,
		Title:       title,
		Description: desc,
		ServerID:    ev.ServerID,
		EventID:     ev.ID,
		Group:       group,
	}
}
