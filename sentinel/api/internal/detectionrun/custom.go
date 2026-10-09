package detectionrun

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/luca-staudt/Defentrax/sentinel/detection"
)

// ParseRuleDefinition decodes a stored rule definition into an engine rule.
func ParseRuleDefinition(def []byte) (detection.Rule, error) {
	var raw struct {
		ID          string `json:"id"`
		Name        string `json:"name"`
		Description string `json:"description"`
		Severity    string `json:"severity"`
		Version     int    `json:"version"`
		Condition   struct {
			Source          string            `json:"source"`
			Sources         []string          `json:"sources"`
			Category        string            `json:"category"`
			EventType       string            `json:"event_type"`
			MessageContains string            `json:"message_contains"`
			Fields          map[string]string `json:"fields"`
		} `json:"condition"`
		Threshold *struct {
			Count         int `json:"count"`
			WindowSeconds int `json:"window_seconds"`
		} `json:"threshold"`
		GroupBy []string `json:"group_by"`
		Action  struct {
			Title       string `json:"title"`
			Description string `json:"description"`
		} `json:"action"`
	}
	if err := json.Unmarshal(def, &raw); err != nil {
		return detection.Rule{}, err
	}
	rule := detection.Rule{
		ID:          raw.ID,
		Name:        raw.Name,
		Description: raw.Description,
		Severity:    raw.Severity,
		Version:     raw.Version,
		Condition: detection.Condition{
			Source:          raw.Condition.Source,
			Sources:         raw.Condition.Sources,
			Category:        raw.Condition.Category,
			EventType:       raw.Condition.EventType,
			MessageContains: raw.Condition.MessageContains,
			Fields:          raw.Condition.Fields,
		},
		GroupBy: raw.GroupBy,
		Action: detection.Action{
			Title:       raw.Action.Title,
			Description: raw.Action.Description,
		},
	}
	if raw.Threshold != nil {
		rule.Threshold = &detection.Threshold{
			Count:         raw.Threshold.Count,
			WindowSeconds: raw.Threshold.WindowSeconds,
		}
	}
	if err := rule.Validate(); err != nil {
		return detection.Rule{}, err
	}
	return rule, nil
}

// CustomRuleDefinition serializes an operator-authored rule. origin is always "custom".
func CustomRuleDefinition(rule detection.Rule) ([]byte, error) {
	def, err := definitionJSON(rule)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(def, &payload); err != nil {
		return nil, err
	}
	payload["origin"] = "custom"
	return json.Marshal(payload)
}

// EditedRuleDefinition serializes a rule an operator changed.
// Bundled rules stay on their original id and are marked so startup does not restore the file.
func EditedRuleDefinition(rule detection.Rule, custom bool) ([]byte, error) {
	def, err := definitionJSON(rule)
	if err != nil {
		return nil, err
	}
	var payload map[string]any
	if err := json.Unmarshal(def, &payload); err != nil {
		return nil, err
	}
	payload["user_modified"] = true
	if custom {
		payload["origin"] = "custom"
	}
	return json.Marshal(payload)
}

// SlugCustomRuleID builds a stable custom.* id from a display name.
func SlugCustomRuleID(name string) string {
	s := strings.ToLower(strings.TrimSpace(name))
	var b strings.Builder
	lastDash := false
	for _, r := range s {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') {
			b.WriteRune(r)
			lastDash = false
			continue
		}
		if !lastDash && b.Len() > 0 {
			b.WriteByte('-')
			lastDash = true
		}
	}
	out := strings.Trim(b.String(), "-")
	if out == "" {
		out = "rule"
	}
	return "custom." + out
}

// HasMatchSignal reports whether a condition can select events.
func HasMatchSignal(c detection.Condition) bool {
	if strings.TrimSpace(c.Source) != "" || strings.TrimSpace(c.Category) != "" {
		return true
	}
	if strings.TrimSpace(c.EventType) != "" || strings.TrimSpace(c.MessageContains) != "" {
		return true
	}
	for k, v := range c.Fields {
		if strings.TrimSpace(k) != "" && strings.TrimSpace(v) != "" {
			return true
		}
	}
	return false
}

// NormalizeCustomRule fills defaults for a new operator rule and rejects rules that would match every event.
func NormalizeCustomRule(rule detection.Rule) (detection.Rule, error) {
	rule.ID = strings.TrimSpace(rule.ID)
	if rule.ID == "" {
		rule.ID = SlugCustomRuleID(rule.Name)
	}
	return normalizeRule(rule, true)
}

// NormalizeEditedRule validates an update and keeps the existing rule id.
func NormalizeEditedRule(rule detection.Rule, custom bool) (detection.Rule, error) {
	rule.ID = strings.TrimSpace(rule.ID)
	if rule.ID == "" {
		return detection.Rule{}, fmt.Errorf("rule id required")
	}
	return normalizeRule(rule, custom)
}

func normalizeRule(rule detection.Rule, requireCustomPrefix bool) (detection.Rule, error) {
	rule.Name = strings.TrimSpace(rule.Name)
	rule.Description = strings.TrimSpace(rule.Description)
	rule.Severity = strings.ToLower(strings.TrimSpace(rule.Severity))
	rule.ID = strings.TrimSpace(rule.ID)
	if requireCustomPrefix && !strings.HasPrefix(rule.ID, "custom.") {
		return detection.Rule{}, fmt.Errorf("custom rule id must start with custom")
	}
	if rule.Version < 1 {
		rule.Version = 1
	}
	rule.Action.Title = strings.TrimSpace(rule.Action.Title)
	if rule.Action.Title == "" {
		rule.Action.Title = rule.Name
	}
	rule.Action.Description = strings.TrimSpace(rule.Action.Description)
	if rule.Action.Description == "" {
		rule.Action.Description = rule.Description
	}
	if !HasMatchSignal(rule.Condition) {
		return detection.Rule{}, fmt.Errorf("set at least one match: source, category, event type, message text, or a field")
	}
	if err := rule.Validate(); err != nil {
		return detection.Rule{}, err
	}
	return rule, nil
}
