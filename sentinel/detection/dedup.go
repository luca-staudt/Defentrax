package detection

import (
	"github.com/google/uuid"

	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

// AlertDedupKey returns a stable deduplication key for a rule match (rule + server + group_by).
func AlertDedupKey(ruleYAMLID string, serverID uuid.UUID, group map[string]string) string {
	raw := windowKey(ruleYAMLID, serverID.String(), group)
	return event.Fingerprint(raw)
}
