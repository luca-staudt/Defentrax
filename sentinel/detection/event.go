package detection

import (
	"time"

	"github.com/google/uuid"
)

// Event is a normalized security event passed to the detection engine.
type Event struct {
	ID         uuid.UUID
	ServerID   uuid.UUID
	AgentID    uuid.UUID
	OccurredAt time.Time
	Source     string
	Category   string
	Severity   string
	Host       string
	Message    string
	Fields     map[string]any
}
