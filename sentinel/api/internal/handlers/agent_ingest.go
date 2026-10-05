package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"time"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/apperrors"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/auth/agentctx"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/middleware"
	"github.com/luca-staudt/Sentinel/sentinel/api/internal/store"
	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

type ingestEventsResponse struct {
	Accepted   int                    `json:"accepted"`
	Duplicates int                    `json:"duplicates"`
	Rejected   []event.RejectedEvent  `json:"rejected,omitempty"`
}

func (h *AgentHandler) IngestEvents(w http.ResponseWriter, r *http.Request) {
	a, ok := agentctx.FromContext(r.Context())
	if !ok {
		apperrors.WriteJSON(w, http.StatusUnauthorized, "unauthorized", "agent authentication required", middleware.RequestIDFromContext(r.Context()))
		return
	}
	if h.IngestLimiter != nil {
		allowed, err := h.IngestLimiter.Allow(r.Context(), a.ID.String())
		if err != nil {
			internalError(w, r)
			return
		}
		if !allowed {
			apperrors.WriteJSON(w, http.StatusTooManyRequests, "rate_limited", "event ingestion rate limit exceeded", middleware.RequestIDFromContext(r.Context()))
			return
		}
	}

	maxBody := h.ingestMaxBodyBytes()
	var req ingestEventsRequest
	if err := decodeIngestJSON(r, maxBody, &req); err != nil {
		if errors.Is(err, errPayloadTooLarge) {
			apperrors.WriteJSON(w, http.StatusRequestEntityTooLarge, "payload_too_large", "request body too large", middleware.RequestIDFromContext(r.Context()))
			return
		}
		badRequest(w, r, "invalid_input", "invalid JSON body")
		return
	}
	if len(req.Events) == 0 {
		badRequest(w, r, "invalid_input", "events array required")
		return
	}
	maxBatch := h.ingestMaxBatchSize()
	if len(req.Events) > maxBatch {
		badRequest(w, r, "invalid_input", "too many events in batch")
		return
	}

	now := time.Now().UTC()
	var rejected []event.RejectedEvent
	var toInsert []store.EventInsertRow
	for i, ev := range req.Events {
		norm, rej := event.ValidateAndNormalize(ev, now)
		if rej != nil {
			rej.Index = i
			rejected = append(rejected, *rej)
			continue
		}
		toInsert = append(toInsert, store.EventInsertRow{
			IngestID:    norm.IngestID,
			OccurredAt:  norm.OccurredAt,
			Source:      norm.Source,
			Category:    norm.Category,
			Severity:    norm.Severity,
			Host:        norm.Host,
			Message:     norm.Message,
			Fingerprint: norm.Fingerprint,
			Raw:         norm.Raw,
			Fields:      norm.Fields,
		})
	}

	accepted := 0
	duplicates := 0
	if len(toInsert) > 0 {
		ctx, cancel := context.WithTimeout(r.Context(), h.ingestDBTimeout())
		defer cancel()
		inserted, err := store.InsertEventsBatch(ctx, h.Pool, a.ID, a.ServerID, toInsert)
		if err != nil {
			if errors.Is(err, context.DeadlineExceeded) {
				apperrors.WriteJSON(w, http.StatusGatewayTimeout, "ingest_timeout", "event persistence timed out", middleware.RequestIDFromContext(r.Context()))
				return
			}
			internalError(w, r)
			return
		}
		accepted = len(inserted)
		duplicates = len(toInsert) - accepted
	}

	writeJSON(w, http.StatusAccepted, ingestEventsResponse{
		Accepted:   accepted,
		Duplicates: duplicates,
		Rejected:   rejected,
	})
}

var errPayloadTooLarge = errors.New("payload too large")

func decodeIngestJSON(r *http.Request, maxBytes int64, dst any) error {
	defer r.Body.Close()
	if maxBytes < 1 {
		maxBytes = 1 << 20
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, maxBytes+1))
	if err != nil {
		return err
	}
	if int64(len(body)) > maxBytes {
		return errPayloadTooLarge
	}
	dec := json.NewDecoder(bytes.NewReader(body))
	dec.DisallowUnknownFields()
	return dec.Decode(dst)
}

func (h *AgentHandler) ingestMaxBodyBytes() int64 {
	if h.Config.IngestMaxBodyBytes > 0 {
		return h.Config.IngestMaxBodyBytes
	}
	return 4 << 20
}

func (h *AgentHandler) ingestMaxBatchSize() int {
	if h.Config.IngestMaxBatchSize > 0 {
		return h.Config.IngestMaxBatchSize
	}
	return event.MaxBatchSize
}

func (h *AgentHandler) ingestDBTimeout() time.Duration {
	if h.Config.IngestDBTimeout > 0 {
		return h.Config.IngestDBTimeout
	}
	return 15 * time.Second
}
