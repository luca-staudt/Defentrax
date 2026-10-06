package pluginruntime

import (
	"context"
	"log/slog"
	"sync"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
	"github.com/luca-staudt/Defentrax/sentinel/plugins/loader"
	"github.com/luca-staudt/Defentrax/sentinel/plugins/sdk"
)

// Runtime holds admitted/loaded plugins for the API process.
type Runtime struct {
	Log    *slog.Logger
	Pool   *pgxpool.Pool
	Policy loader.Policy

	mu      sync.RWMutex
	loaded  map[string]sdk.Plugin
	parsers map[string]sdk.EventParser
}

// Bootstrap discovers manifests, syncs DB rows, and instantiates enabled plugins.
func Bootstrap(ctx context.Context, log *slog.Logger, pool *pgxpool.Pool, policy loader.Policy) (*Runtime, error) {
	rt := &Runtime{
		Log:     log,
		Pool:    pool,
		Policy:  policy,
		loaded:  map[string]sdk.Plugin{},
		parsers: map[string]sdk.EventParser{},
	}
	if err := rt.Reload(ctx); err != nil {
		return nil, err
	}
	return rt, nil
}

// Reload re-discovers plugins and reloads enabled instances.
func (rt *Runtime) Reload(ctx context.Context) error {
	admitted, rejected, err := loader.Discover(rt.Policy.RootDir, rt.Policy)
	if err != nil {
		return err
	}
	for slug, reason := range rejected {
		rt.Log.Warn("plugin rejected", "slug", slug, "reason", reason)
		if rt.Pool != nil {
			_, _ = store.UpsertPluginSync(ctx, rt.Pool, store.PluginUpsert{
				Slug:       slug,
				Name:       slug,
				Version:    "",
				Kind:       "",
				APIVersion: sdk.APIVersion,
				LoadStatus: "rejected",
				LoadError:  reason,
			})
		}
	}

	enabled := map[string]bool{}
	if rt.Pool != nil {
		enabled, err = store.EnabledPluginSlugs(ctx, rt.Pool)
		if err != nil {
			return err
		}
	}

	for _, c := range admitted {
		if rt.Pool != nil {
			_, err := store.UpsertPluginSync(ctx, rt.Pool, store.PluginUpsert{
				Slug:           c.Manifest.Slug,
				Name:           c.Manifest.Name,
				Version:        c.Manifest.Version,
				Description:    c.Manifest.Description,
				Kind:           string(c.Manifest.Kind),
				APIVersion:     c.Manifest.APIVersion,
				ChecksumSHA256: c.Manifest.ChecksumSHA256,
				Signature:      c.Manifest.Signature,
				SourcePath:     c.Dir,
				LoadStatus:     "admitted",
				LoadError:      "",
			})
			if err != nil {
				return err
			}
		}
	}

	hostFor := func(slug string) sdk.Host {
		return &dbHost{log: rt.Log.With("plugin", slug), pool: rt.Pool, slug: slug}
	}

	loaded, skipped, err := loader.Instantiate(ctx, admitted, hostFor, func(slug string) bool {
		return enabled[slug]
	})
	if err != nil {
		return err
	}

	rt.mu.Lock()
	// Close previous instances
	for _, p := range rt.loaded {
		_ = p.Close(ctx)
	}
	rt.loaded = map[string]sdk.Plugin{}
	rt.parsers = map[string]sdk.EventParser{}
	for _, l := range loaded {
		slug := l.Candidate.Manifest.Slug
		rt.loaded[slug] = l.Instance
		if parser, ok := l.Instance.(sdk.EventParser); ok {
			rt.parsers[slug] = parser
		}
		if rt.Pool != nil {
			_ = store.UpdatePluginLoadState(ctx, rt.Pool, slug, "loaded", "")
		}
		rt.Log.Info("plugin loaded", "slug", slug, "kind", l.Candidate.Manifest.Kind)
	}
	rt.mu.Unlock()

	for slug, reason := range skipped {
		if reason == "disabled" {
			if rt.Pool != nil {
				_ = store.UpdatePluginLoadState(ctx, rt.Pool, slug, "disabled", "")
			}
			continue
		}
		rt.Log.Warn("plugin not loaded", "slug", slug, "reason", reason)
		if rt.Pool != nil {
			_ = store.UpdatePluginLoadState(ctx, rt.Pool, slug, "admitted", reason)
		}
	}
	return nil
}

// EventParser returns a loaded parser by slug.
func (rt *Runtime) EventParser(slug string) (sdk.EventParser, bool) {
	rt.mu.RLock()
	defer rt.mu.RUnlock()
	p, ok := rt.parsers[slug]
	return p, ok
}

// Close shuts down loaded plugins.
func (rt *Runtime) Close(ctx context.Context) {
	rt.mu.Lock()
	defer rt.mu.Unlock()
	for _, p := range rt.loaded {
		_ = p.Close(ctx)
	}
	rt.loaded = map[string]sdk.Plugin{}
	rt.parsers = map[string]sdk.EventParser{}
}

type dbHost struct {
	log  *slog.Logger
	pool *pgxpool.Pool
	slug string
}

func (h *dbHost) Logger() *slog.Logger {
	if h.log == nil {
		return slog.Default()
	}
	return h.log
}

func (h *dbHost) Config(ctx context.Context, key string) (any, bool, error) {
	if h.pool == nil {
		return nil, false, nil
	}
	row, err := store.GetPluginBySlug(ctx, h.pool, h.slug)
	if err != nil {
		return nil, false, err
	}
	m, err := store.GetPluginConfigMap(ctx, h.pool, row.ID)
	if err != nil {
		return nil, false, err
	}
	v, ok := m[key]
	return v, ok, nil
}

func (h *dbHost) ConfigString(ctx context.Context, key string) (string, bool, error) {
	v, ok, err := h.Config(ctx, key)
	if err != nil || !ok {
		return "", ok, err
	}
	s, okStr := v.(string)
	if !okStr {
		return "", false, nil
	}
	return s, true, nil
}
