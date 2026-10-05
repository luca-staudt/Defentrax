package notify

import "strings"

// Canonical severities (lowest → highest).
const (
	SeverityInfo     = "info"
	SeverityLow      = "low"
	SeverityMedium   = "medium"
	SeverityHigh     = "high"
	SeverityCritical = "critical"
)

var severityRank = map[string]int{
	SeverityInfo:     1,
	SeverityLow:      2,
	SeverityMedium:   3,
	SeverityHigh:     4,
	SeverityCritical: 5,
}

// NormalizeSeverity lowercases and validates a severity string.
func NormalizeSeverity(s string) (string, bool) {
	s = strings.ToLower(strings.TrimSpace(s))
	_, ok := severityRank[s]
	return s, ok
}

// MeetsMin reports whether alertSeverity is at least as severe as minSeverity.
func MeetsMin(alertSeverity, minSeverity string) bool {
	a, okA := severityRank[strings.ToLower(strings.TrimSpace(alertSeverity))]
	m, okM := severityRank[strings.ToLower(strings.TrimSpace(minSeverity))]
	if !okA || !okM {
		return false
	}
	return a >= m
}

// Trigger event names for notification rules.
const (
	TriggerAlertCreated       = "alert.created"
	TriggerAlertUpdated       = "alert.updated"
	TriggerAlertStatusChanged = "alert.status_changed"
)

func ValidTrigger(t string) bool {
	switch t {
	case TriggerAlertCreated, TriggerAlertUpdated, TriggerAlertStatusChanged:
		return true
	default:
		return false
	}
}

// Channel types.
const (
	ChannelDiscord = "discord"
	ChannelSlack   = "slack"
	ChannelEmail   = "email"
	ChannelWebhook = "webhook"
)

func ValidChannelType(t string) bool {
	switch t {
	case ChannelDiscord, ChannelSlack, ChannelEmail, ChannelWebhook:
		return true
	default:
		return false
	}
}
