// Package event defines the canonical wire format for security events (agent → API).
package event

import (
	"encoding/json"
	"time"
)

// CanonicalEvent is the JSON shape agents send and the API validates before persistence.
type CanonicalEvent struct {
	IngestID    string          `json:"ingest_id"`
	OccurredAt  time.Time       `json:"occurred_at"`
	Source      string          `json:"source"`
	Category    string          `json:"category,omitempty"`
	Severity    string          `json:"severity,omitempty"`
	Host        string          `json:"host,omitempty"`
	Message     string          `json:"message"`
	Raw         json.RawMessage `json:"raw,omitempty"`
	Fields      map[string]any  `json:"fields,omitempty"`
	Fingerprint string          `json:"fingerprint,omitempty"`
}
