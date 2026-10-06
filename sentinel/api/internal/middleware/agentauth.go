package middleware

import (
	"net/http"
	"strings"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/auth/agentctx"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/secrets"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

// AuthenticateAgent loads agent bearer credentials into context (sagt_ prefix).
func AuthenticateAgent(pool *pgxpool.Pool) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if pool == nil {
				requestID := RequestIDFromContext(r.Context())
				apperrors.WriteJSON(w, http.StatusServiceUnavailable, "database_unavailable", "agent authentication requires database", requestID)
				return
			}
			authz := r.Header.Get("Authorization")
			token, ok := secrets.ParseBearer(authz)
			if !ok || !strings.HasPrefix(token, "sagt_") {
				requestID := RequestIDFromContext(r.Context())
				apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "agent authentication required", requestID)
				return
			}
			hash := secrets.HashToken(token)
			tok, agent, err := store.LookupAgentByTokenHash(r.Context(), pool, hash)
			if err != nil {
				requestID := RequestIDFromContext(r.Context())
				apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "invalid agent credential", requestID)
				return
			}
			a := &agentctx.Agent{
				ID:       agent.ID,
				ServerID: agent.ServerID,
				TokenID:  tok.ID,
			}
			next.ServeHTTP(w, r.WithContext(agentctx.WithContext(r.Context(), a)))
		})
	}
}
