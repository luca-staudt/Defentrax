package detectionrun

import (
	"context"
	"log/slog"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
	"github.com/luca-staudt/Defentrax/sentinel/detection"
)

// Service wires the detection engine, rule catalog, and async worker.
type Service struct {
	Log    *slog.Logger
	Pool   *pgxpool.Pool
	Engine *detection.Engine
	Rules  []detection.Rule
	Runner *Runner
}

func (s *Service) ReloadEnabled(ctx context.Context) error {
	enabled, err := store.EnabledYAMLRuleIDs(ctx, s.Pool)
	if err != nil {
		return err
	}
	customRows, err := store.ListRulesByOrigin(ctx, s.Pool, "custom")
	if err != nil {
		return err
	}
	base := make([]detection.Rule, 0, len(s.Rules))
	for _, rule := range s.Rules {
		if strings.HasPrefix(rule.ID, "custom.") {
			continue
		}
		base = append(base, rule)
	}
	for _, row := range customRows {
		rule, err := ParseRuleDefinition(row.Definition)
		if err != nil {
			if s.Log != nil {
				s.Log.Warn("skipping invalid custom rule", "name", row.Name, "error", err)
			}
			continue
		}
		base = append(base, rule)
	}
	s.Rules = base
	s.Engine.SetRules(base, enabled)
	return nil
}
