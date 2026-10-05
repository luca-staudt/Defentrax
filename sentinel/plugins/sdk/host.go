package sdk

import (
	"context"
	"log/slog"
)

// Host is the only capability surface plugins receive.
//
// Intentionally narrow: no filesystem, no raw network dialer, no database,
// no process execution. Plugins that need config use Config; logging uses Logger.
//
// This is interface-level confinement, not an OS sandbox. See docs/plugins.md.
type Host interface {
	// Logger returns a slog logger scoped to the plugin slug.
	Logger() *slog.Logger
	// Config returns a JSON-decoded config value for key from plugin_configs.
	// Missing keys return (nil, false, nil).
	Config(ctx context.Context, key string) (value any, ok bool, err error)
	// ConfigString is a convenience for string-valued configs.
	ConfigString(ctx context.Context, key string) (value string, ok bool, err error)
}

// StaticHost is a test/dev Host backed by an in-memory config map.
type StaticHost struct {
	Log    *slog.Logger
	Values map[string]any
}

func (h *StaticHost) Logger() *slog.Logger {
	if h.Log == nil {
		return slog.Default()
	}
	return h.Log
}

func (h *StaticHost) Config(ctx context.Context, key string) (any, bool, error) {
	_ = ctx
	if h.Values == nil {
		return nil, false, nil
	}
	v, ok := h.Values[key]
	return v, ok, nil
}

func (h *StaticHost) ConfigString(ctx context.Context, key string) (string, bool, error) {
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
