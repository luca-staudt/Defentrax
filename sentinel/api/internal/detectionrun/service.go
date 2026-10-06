package detectionrun

import (
	"context"
	"log/slog"

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
	s.Engine.SetRules(s.Rules, enabled)
	return nil
}
