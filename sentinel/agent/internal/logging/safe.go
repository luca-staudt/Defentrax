package logging

import (
	"context"
	"log/slog"
	"strings"
)

// RedactAgentToken replaces bearer/agent/enrollment secrets in log messages.
func RedactAgentToken(s string) string {
	for _, prefix := range []string{"sagt_", "senr_", "sent_"} {
		if idx := strings.Index(s, prefix); idx >= 0 {
			end := idx + len(prefix)
			for end < len(s) && s[end] != ' ' && s[end] != '"' && s[end] != '\'' {
				end++
			}
			s = s[:idx] + prefix + "<redacted>" + s[end:]
		}
	}
	return s
}

// NewSafeLogger wraps slog default handler text to redact tokens.
func NewSafeLogger() *slog.Logger {
	return slog.New(&redactHandler{inner: slog.Default().Handler()})
}

type redactHandler struct {
	inner slog.Handler
}

func (h *redactHandler) Enabled(ctx context.Context, level slog.Level) bool {
	return h.inner.Enabled(ctx, level)
}

func (h *redactHandler) Handle(ctx context.Context, r slog.Record) error {
	r2 := slog.NewRecord(r.Time, r.Level, RedactAgentToken(r.Message), r.PC)
	r.Attrs(func(a slog.Attr) bool {
		val := a.Value.String()
		r2.AddAttrs(slog.String(a.Key, RedactAgentToken(val)))
		return true
	})
	return h.inner.Handle(ctx, r2)
}

func (h *redactHandler) WithAttrs(attrs []slog.Attr) slog.Handler {
	return &redactHandler{inner: h.inner.WithAttrs(attrs)}
}

func (h *redactHandler) WithGroup(name string) slog.Handler {
	return &redactHandler{inner: h.inner.WithGroup(name)}
}
