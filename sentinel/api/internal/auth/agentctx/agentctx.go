package agentctx

import (
	"context"

	"github.com/google/uuid"
)

type ctxKey struct{}

// Agent is the authenticated Sentinel agent attached to request context.
type Agent struct {
	ID       uuid.UUID
	ServerID uuid.UUID
	TokenID  uuid.UUID
}

func WithContext(ctx context.Context, a *Agent) context.Context {
	return context.WithValue(ctx, ctxKey{}, a)
}

func FromContext(ctx context.Context) (*Agent, bool) {
	a, ok := ctx.Value(ctxKey{}).(*Agent)
	return a, ok
}
