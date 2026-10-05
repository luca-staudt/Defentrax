package detection

import (
	"fmt"
	"strings"
)

// Rule is the YAML detection rule format consumed by the engine.
type Rule struct {
	ID          string     `yaml:"id"`
	Name        string     `yaml:"name"`
	Description string     `yaml:"description"`
	Severity    string     `yaml:"severity"`
	Version     int        `yaml:"version"`
	Condition   Condition  `yaml:"condition"`
	Threshold   *Threshold `yaml:"threshold,omitempty"`
	GroupBy     []string   `yaml:"group_by,omitempty"`
	Action      Action     `yaml:"action"`
	SourceFile  string     `yaml:"-"`
}

// Condition selects events for evaluation.
type Condition struct {
	Source          string            `yaml:"source,omitempty"`
	Sources         []string          `yaml:"sources,omitempty"`
	Category        string            `yaml:"category,omitempty"`
	EventType       string            `yaml:"event_type,omitempty"`
	MessageContains string            `yaml:"message_contains,omitempty"`
	Fields          map[string]string `yaml:"fields,omitempty"`
}

// Threshold aggregates matches in a sliding/fixed window before firing.
type Threshold struct {
	Count         int `yaml:"count"`
	WindowSeconds int `yaml:"window_seconds"`
}

// Action describes the alert payload when a rule matches.
type Action struct {
	Title       string `yaml:"title"`
	Description string `yaml:"description"`
}

// Validate checks rule shape and wording constraints.
func (r *Rule) Validate() error {
	if strings.TrimSpace(r.ID) == "" {
		return fmt.Errorf("rule id required")
	}
	if strings.TrimSpace(r.Name) == "" {
		return fmt.Errorf("rule %q: name required", r.ID)
	}
	if err := validatePossibilityLanguage(r.Name); err != nil {
		return fmt.Errorf("rule %q: name: %w", r.ID, err)
	}
	if err := validatePossibilityLanguage(r.Description); err != nil {
		return fmt.Errorf("rule %q: description: %w", r.ID, err)
	}
	sev := strings.TrimSpace(r.Severity)
	if sev == "" {
		return fmt.Errorf("rule %q: severity required", r.ID)
	}
	switch sev {
	case "info", "low", "medium", "high", "critical":
	default:
		return fmt.Errorf("rule %q: invalid severity %q", r.ID, sev)
	}
	if r.Version < 1 {
		return fmt.Errorf("rule %q: version must be >= 1", r.ID)
	}
	if strings.TrimSpace(r.Action.Title) == "" {
		return fmt.Errorf("rule %q: action.title required", r.ID)
	}
	if err := validatePossibilityLanguage(r.Action.Title); err != nil {
		return fmt.Errorf("rule %q: action.title: %w", r.ID, err)
	}
	if r.Threshold != nil {
		if r.Threshold.Count < 2 {
			return fmt.Errorf("rule %q: threshold.count must be >= 2 when threshold is set", r.ID)
		}
		if r.Threshold.WindowSeconds < 1 {
			return fmt.Errorf("rule %q: threshold.window_seconds must be >= 1", r.ID)
		}
	}
	return nil
}

var forbiddenTerms = []string{
	"attacker detected",
	"attacker identified",
	"malicious actor",
	"confirmed breach",
	"confirmed attack",
}

func validatePossibilityLanguage(s string) error {
	lower := strings.ToLower(s)
	for _, term := range forbiddenTerms {
		if strings.Contains(lower, term) {
			return fmt.Errorf("must use possibility-oriented wording (forbidden phrase %q)", term)
		}
	}
	if strings.Contains(lower, "attacker") && !strings.Contains(lower, "possible") {
		return fmt.Errorf("must use possibility-oriented wording when referring to threats")
	}
	return nil
}
