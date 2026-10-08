package detectionrun

import (
	"context"
	"encoding/json"
	"log/slog"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/alerts"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
	"github.com/luca-staudt/Defentrax/sentinel/detection"
)

// PendingEvent is queued for asynchronous detection after persistence.
type PendingEvent struct {
	ID         uuid.UUID
	ServerID   uuid.UUID
	AgentID    uuid.UUID
	OccurredAt time.Time
	Source     string
	Category   string
	Severity   string
	Host       string
	Message    string
	Fields     []byte
}

// Runner evaluates events against the detection engine and writes minimal alerts.
type Runner struct {
	log    *slog.Logger
	pool   *pgxpool.Pool
	engine *detection.Engine
	alerts *alerts.Manager
	ch     chan PendingEvent
	wg     sync.WaitGroup
}

func New(log *slog.Logger, pool *pgxpool.Pool, engine *detection.Engine, alertMgr *alerts.Manager, queueSize int) *Runner {
	if queueSize < 1 {
		queueSize = 256
	}
	r := &Runner{
		log:    log,
		pool:   pool,
		engine: engine,
		alerts: alertMgr,
		ch:     make(chan PendingEvent, queueSize),
	}
	r.wg.Add(1)
	go r.worker()
	return r
}

func (r *Runner) Close() {
	close(r.ch)
	r.wg.Wait()
}

// Enqueue schedules detection for one persisted event (non-blocking; drops when full).
func (r *Runner) Enqueue(ev PendingEvent) {
	select {
	case r.ch <- ev:
	default:
		r.log.Warn("detection queue full, dropping event", "event_id", ev.ID)
	}
}

func (r *Runner) worker() {
	defer r.wg.Done()
	for ev := range r.ch {
		r.processOne(ev)
	}
}

func (r *Runner) processOne(pe PendingEvent) {
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	fields := map[string]any{}
	if len(pe.Fields) > 0 {
		_ = json.Unmarshal(pe.Fields, &fields)
	}
	dev := detection.Event{
		ID:         pe.ID,
		ServerID:   pe.ServerID,
		AgentID:    pe.AgentID,
		OccurredAt: pe.OccurredAt,
		Source:     pe.Source,
		Category:   pe.Category,
		Severity:   pe.Severity,
		Host:       pe.Host,
		Message:    pe.Message,
		Fields:     fields,
	}
	matches, err := r.engine.Evaluate(ctx, dev)
	if err != nil {
		r.log.Error("detection evaluate failed", "error", err, "event_id", pe.ID)
		return
	}
	for _, m := range matches {
		ruleID, err := store.RuleDBIDByYAMLID(ctx, r.pool, m.RuleID)
		if err != nil {
			r.log.Warn("rule id not in database", "yaml_id", m.RuleID, "error", err)
			continue
		}
		if r.alerts == nil {
			r.log.Warn("alert manager not configured, skipping match", "rule_id", m.RuleID)
			continue
		}
		alertID, created, err := r.alerts.HandleMatch(ctx, alerts.MatchInput{
			Match:      m,
			RuleDBID:   ruleID,
			OccurredAt: pe.OccurredAt,
		})
		if err != nil {
			r.log.Error("alert handle failed", "error", err, "rule_id", m.RuleID)
			continue
		}
		if alertID == uuid.Nil && !created {
			r.log.Info("detection match silenced", "rule_id", m.RuleID, "event_id", pe.ID, "server_id", pe.ServerID)
			continue
		}
		if created {
			r.log.Info("detection alert opened", "alert_id", alertID, "rule_id", m.RuleID, "event_id", pe.ID)
		} else {
			r.log.Info("detection alert aggregated", "alert_id", alertID, "rule_id", m.RuleID, "event_id", pe.ID)
		}
	}
}

// Bootstrap loads YAML rules, syncs to DB, and configures engine enable flags.
func Bootstrap(ctx context.Context, log *slog.Logger, pool *pgxpool.Pool, engine *detection.Engine, rulesPath string) error {
	rules, err := detection.LoadRulesFromDir(rulesPath)
	if err != nil {
		return err
	}
	var upserts []store.RuleUpsert
	for _, rule := range rules {
		def, err := definitionJSON(rule)
		if err != nil {
			return err
		}
		upserts = append(upserts, store.RuleUpsert{
			YAMLID:      rule.ID,
			Name:        rule.Name,
			Description: rule.Description,
			Severity:    rule.Severity,
			Version:     rule.Version,
			Definition:  def,
		})
	}
	if err := store.SyncBundledRules(ctx, pool, upserts); err != nil {
		return err
	}
	rules, err = overlayUserModified(ctx, log, pool, rules)
	if err != nil {
		return err
	}
	customRows, err := store.ListRulesByOrigin(ctx, pool, "custom")
	if err != nil {
		return err
	}
	for _, row := range customRows {
		rule, err := ParseRuleDefinition(row.Definition)
		if err != nil {
			log.Warn("skipping invalid custom rule", "name", row.Name, "error", err)
			continue
		}
		rules = append(rules, rule)
	}
	enabled, err := store.EnabledYAMLRuleIDs(ctx, pool)
	if err != nil {
		return err
	}
	engine.SetRules(rules, enabled)
	log.Info("detection rules loaded", "count", len(rules), "path", rulesPath, "custom", len(customRows))
	return nil
}

func overlayUserModified(ctx context.Context, log *slog.Logger, pool *pgxpool.Pool, rules []detection.Rule) ([]detection.Rule, error) {
	rows, err := store.ListUserModifiedBundled(ctx, pool)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return rules, nil
	}
	byID := make(map[string]detection.Rule, len(rows))
	for _, row := range rows {
		rule, err := ParseRuleDefinition(row.Definition)
		if err != nil {
			if log != nil {
				log.Warn("skipping invalid edited rule", "name", row.Name, "error", err)
			}
			continue
		}
		byID[rule.ID] = rule
	}
	out := append([]detection.Rule(nil), rules...)
	for i, rule := range out {
		if repl, ok := byID[rule.ID]; ok {
			out[i] = repl
		}
	}
	return out, nil
}

func definitionJSON(rule detection.Rule) ([]byte, error) {
	payload := map[string]any{
		"id":          rule.ID,
		"name":        rule.Name,
		"description": rule.Description,
		"severity":    rule.Severity,
		"version":     rule.Version,
		"condition": map[string]any{
			"source":           rule.Condition.Source,
			"sources":          rule.Condition.Sources,
			"category":         rule.Condition.Category,
			"event_type":       rule.Condition.EventType,
			"message_contains": rule.Condition.MessageContains,
			"fields":           rule.Condition.Fields,
		},
		"group_by": rule.GroupBy,
		"action": map[string]any{
			"title":       rule.Action.Title,
			"description": rule.Action.Description,
		},
	}
	if rule.Threshold != nil {
		payload["threshold"] = map[string]any{
			"count":          rule.Threshold.Count,
			"window_seconds": rule.Threshold.WindowSeconds,
		}
	}
	return json.Marshal(payload)
}
