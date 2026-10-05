package event

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"unicode"
)

// RejectedEvent describes one invalid event in a batch (partial success).
type RejectedEvent struct {
	Index   int    `json:"index"`
	Code    string `json:"code"`
	Message string `json:"message"`
}

// NormalizedEvent is ready for persistence after validation and sanitization.
type NormalizedEvent struct {
	IngestID    string
	OccurredAt  time.Time
	Source      string
	Category    string
	Severity    string
	Host        string
	Message     string
	Fingerprint string
	Raw         []byte
	Fields      []byte
}

// ValidateAndNormalize checks one canonical event and returns a DB-ready row or a rejection reason.
func ValidateAndNormalize(ev CanonicalEvent, now time.Time) (NormalizedEvent, *RejectedEvent) {
	ingestID := sanitizeIdentifier(ev.IngestID, MaxIngestIDLen)
	if ingestID == "" {
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_ingest_id", Message: "ingest_id required (max 128 chars, alphanumeric/._-)"}
	}
	if ev.OccurredAt.IsZero() {
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_occurred_at", Message: "occurred_at required (RFC3339)"}
	}
	occurredAt := ev.OccurredAt.UTC()
	if occurredAt.After(now.Add(MaxFutureSkew * time.Minute)) {
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_occurred_at", Message: "occurred_at too far in the future"}
	}

	source := sanitizeIdentifier(ev.Source, MaxSourceLen)
	if source == "" {
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_source", Message: "source required (max 64 chars)"}
	}
	category := sanitizeIdentifier(ev.Category, MaxCategoryLen)
	host := sanitizeText(ev.Host, MaxHostLen)

	message := sanitizeText(ev.Message, MaxMessageLen)
	if message == "" {
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_message", Message: "message required (max 8192 chars)"}
	}

	sev := strings.ToLower(strings.TrimSpace(ev.Severity))
	if sev == "" {
		sev = "info"
	}
	switch sev {
	case "info", "low", "medium", "high", "critical":
	default:
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_severity", Message: "severity must be info, low, medium, high, or critical"}
	}

	raw := ev.Raw
	if len(raw) == 0 {
		raw = json.RawMessage(`{}`)
	}
	if !json.Valid(raw) {
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_raw", Message: "raw must be valid JSON"}
	}
	if len(raw) > MaxRawBytes {
		return NormalizedEvent{}, &RejectedEvent{Code: "raw_too_large", Message: fmt.Sprintf("raw exceeds %d bytes", MaxRawBytes)}
	}

	fieldsBytes, err := sanitizeFields(ev.Fields)
	if err != nil {
		return NormalizedEvent{}, &RejectedEvent{Code: "invalid_fields", Message: err.Error()}
	}

	fp := sanitizeIdentifier(ev.Fingerprint, MaxFingerprintLen)
	if fp == "" {
		fp = Fingerprint(source, category, sev, message)
	}

	return NormalizedEvent{
		IngestID:    ingestID,
		OccurredAt:  occurredAt,
		Source:      source,
		Category:    category,
		Severity:    sev,
		Host:        host,
		Message:     message,
		Fingerprint: fp,
		Raw:         append([]byte(nil), raw...),
		Fields:      fieldsBytes,
	}, nil
}

func sanitizeText(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if r == 0 || (r < 32 && r != '\t') {
			continue
		}
		b.WriteRune(r)
	}
	out := b.String()
	if len(out) > maxLen {
		out = out[:maxLen]
	}
	return out
}

func sanitizeIdentifier(s string, maxLen int) string {
	s = strings.TrimSpace(s)
	var b strings.Builder
	for _, r := range s {
		if unicode.IsLetter(r) || unicode.IsDigit(r) || r == '.' || r == '_' || r == '-' {
			b.WriteRune(r)
		}
	}
	out := b.String()
	if len(out) > maxLen {
		out = out[:maxLen]
	}
	return out
}

func sanitizeFields(fields map[string]any) ([]byte, error) {
	if len(fields) == 0 {
		return []byte("{}"), nil
	}
	if len(fields) > MaxFieldsCount {
		return nil, fmt.Errorf("fields map exceeds %d keys", MaxFieldsCount)
	}
	clean := make(map[string]any, len(fields))
	for k, v := range fields {
		key := sanitizeIdentifier(k, MaxFieldKeyLen)
		if key == "" {
			continue
		}
		cv, err := sanitizeFieldValue(v, 0)
		if err != nil {
			return nil, err
		}
		clean[key] = cv
	}
	b, err := json.Marshal(clean)
	if err != nil {
		return nil, fmt.Errorf("fields not JSON-serializable")
	}
	if len(b) > MaxRawBytes {
		return nil, fmt.Errorf("fields JSON exceeds %d bytes", MaxRawBytes)
	}
	return b, nil
}

func sanitizeFieldValue(v any, depth int) (any, error) {
	if depth > 3 {
		return nil, fmt.Errorf("fields nested too deeply")
	}
	switch t := v.(type) {
	case string:
		return sanitizeText(t, MaxFieldStrLen), nil
	case float64, bool, nil:
		return v, nil
	case json.Number:
		return t.String(), nil
	case map[string]any:
		if len(t) > MaxFieldsCount {
			return nil, fmt.Errorf("nested fields exceed %d keys", MaxFieldsCount)
		}
		out := make(map[string]any, len(t))
		for k, vv := range t {
			key := sanitizeIdentifier(k, MaxFieldKeyLen)
			if key == "" {
				continue
			}
			sv, err := sanitizeFieldValue(vv, depth+1)
			if err != nil {
				return nil, err
			}
			out[key] = sv
		}
		return out, nil
	case []any:
		if len(t) > MaxFieldsCount {
			return nil, fmt.Errorf("field array exceeds %d elements", MaxFieldsCount)
		}
		out := make([]any, 0, len(t))
		for _, item := range t {
			sv, err := sanitizeFieldValue(item, depth+1)
			if err != nil {
				return nil, err
			}
			out = append(out, sv)
		}
		return out, nil
	default:
		return sanitizeText(fmt.Sprint(v), MaxFieldStrLen), nil
	}
}
