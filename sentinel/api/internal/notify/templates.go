package notify

import (
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
)

// AlertEvent is the payload used for templates and delivery records (no secrets).
type AlertEvent struct {
	AlertID     uuid.UUID `json:"alert_id"`
	ServerID    uuid.UUID `json:"server_id"`
	Title       string    `json:"title"`
	Description string    `json:"description"`
	Severity    string    `json:"severity"`
	Status      string    `json:"status"`
	SourceIP    string    `json:"source_ip,omitempty"`
	EventCount  int       `json:"event_count"`
	Trigger     string    `json:"trigger"`
	OccurredAt  time.Time `json:"occurred_at,omitempty"`
}

// RenderText produces a plain-text notification body.
func RenderText(ev AlertEvent) string {
	var b strings.Builder
	fmt.Fprintf(&b, "[Defentrax] %s (%s)\n", ev.Title, strings.ToUpper(ev.Severity))
	fmt.Fprintf(&b, "Status: %s\n", ev.Status)
	if ev.Description != "" {
		fmt.Fprintf(&b, "%s\n", ev.Description)
	}
	if ev.SourceIP != "" {
		fmt.Fprintf(&b, "Source IP: %s\n", ev.SourceIP)
	}
	fmt.Fprintf(&b, "Event count: %d\n", ev.EventCount)
	fmt.Fprintf(&b, "Alert ID: %s\n", ev.AlertID.String())
	return b.String()
}

// RenderDiscordJSON builds a Discord webhook payload.
func RenderDiscordJSON(ev AlertEvent) map[string]any {
	color := severityColor(ev.Severity)
	return map[string]any{
		"content": fmt.Sprintf("**Defentrax** · %s", strings.ToUpper(ev.Severity)),
		"embeds": []map[string]any{
			{
				"title":       ev.Title,
				"description": ev.Description,
				"color":       color,
				"fields": []map[string]any{
					{"name": "Status", "value": ev.Status, "inline": true},
					{"name": "Severity", "value": ev.Severity, "inline": true},
					{"name": "Events", "value": fmt.Sprintf("%d", ev.EventCount), "inline": true},
					{"name": "Alert ID", "value": ev.AlertID.String(), "inline": false},
				},
			},
		},
	}
}

// RenderSlackJSON builds a Slack incoming-webhook payload.
func RenderSlackJSON(ev AlertEvent) map[string]any {
	text := fmt.Sprintf("*Defentrax* · `%s` · %s\n*%s*\n%s", strings.ToUpper(ev.Severity), ev.Status, ev.Title, ev.Description)
	return map[string]any{
		"text": text,
		"blocks": []map[string]any{
			{
				"type": "section",
				"text": map[string]any{"type": "mrkdwn", "text": text},
			},
			{
				"type": "context",
				"elements": []map[string]any{
					{"type": "mrkdwn", "text": fmt.Sprintf("alert `%s` · events %d", ev.AlertID.String(), ev.EventCount)},
				},
			},
		},
	}
}

// RenderWebhookJSON is the generic outbound webhook body.
func RenderWebhookJSON(ev AlertEvent) map[string]any {
	return map[string]any{
		"source":  "defentrax",
		"event":   ev.Trigger,
		"alert":   ev,
		"message": RenderText(ev),
	}
}

func severityColor(sev string) int {
	switch strings.ToLower(sev) {
	case SeverityCritical:
		return 0xE11D48 // rose
	case SeverityHigh:
		return 0xF97316 // orange
	case SeverityMedium:
		return 0xEAB308 // yellow
	case SeverityLow:
		return 0x3B82F6 // blue
	default:
		return 0x64748B // slate
	}
}
