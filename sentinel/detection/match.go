package detection

import (
	"fmt"
	"strings"
)

// MatchesCondition returns true when the event satisfies the rule condition.
func MatchesCondition(c Condition, ev Event) bool {
	if c.Source != "" && ev.Source != c.Source {
		return false
	}
	if len(c.Sources) > 0 && !stringIn(c.Sources, ev.Source) {
		return false
	}
	if c.Category != "" && ev.Category != c.Category {
		return false
	}
	if c.EventType != "" {
		if eventTypeOf(ev) != c.EventType {
			return false
		}
	}
	if c.MessageContains != "" {
		if !strings.Contains(strings.ToLower(ev.Message), strings.ToLower(c.MessageContains)) {
			return false
		}
	}
	for k, want := range c.Fields {
		got, ok := fieldString(ev.Fields, k)
		if !ok || got != want {
			return false
		}
	}
	return true
}

func eventTypeOf(ev Event) string {
	if ev.Fields == nil {
		return ""
	}
	if v, ok := fieldString(ev.Fields, "event_type"); ok {
		return v
	}
	if v, ok := fieldString(ev.Fields, "type"); ok {
		return v
	}
	return ""
}

func fieldString(fields map[string]any, key string) (string, bool) {
	if fields == nil {
		return "", false
	}
	v, ok := fields[key]
	if !ok {
		return "", false
	}
	switch t := v.(type) {
	case string:
		return t, true
	case float64:
		return fmt.Sprintf("%v", t), true
	case int:
		return fmt.Sprintf("%d", t), true
	case int64:
		return fmt.Sprintf("%d", t), true
	case bool:
		if t {
			return "true", true
		}
		return "false", true
	default:
		return fmt.Sprintf("%v", v), true
	}
}

func stringIn(list []string, v string) bool {
	for _, s := range list {
		if s == v {
			return true
		}
	}
	return false
}
