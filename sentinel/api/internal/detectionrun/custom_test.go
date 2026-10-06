package detectionrun

import (
	"strings"
	"testing"

	"github.com/luca-staudt/Defentrax/sentinel/detection"
)

func TestNormalizeEditedRuleKeepsBundledID(t *testing.T) {
	rule, err := NormalizeEditedRule(detection.Rule{
		ID:          "ssh.possible-brute-force",
		Name:        "Possible SSH brute-force pattern",
		Description: "Possible credential guessing against SSH.",
		Severity:    "high",
		Condition:   detection.Condition{Source: "authlog", MessageContains: "failed"},
		Action:      detection.Action{Title: "Possible SSH brute-force"},
	}, false)
	if err != nil {
		t.Fatal(err)
	}
	if rule.ID != "ssh.possible-brute-force" {
		t.Fatalf("id %q", rule.ID)
	}
	def, err := EditedRuleDefinition(rule, false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(def), `"user_modified":true`) {
		t.Fatalf("definition %s", def)
	}
}

func TestNormalizeCustomRuleRequiresSignal(t *testing.T) {
	_, err := NormalizeCustomRule(detection.Rule{
		Name:        "Possible quiet host",
		Description: "Possible activity with no selector",
		Severity:    "low",
		Action:      detection.Action{Title: "Possible quiet host"},
	})
	if err == nil {
		t.Fatal("expected missing match signal")
	}
}

func TestNormalizeAndRoundTripCustomRule(t *testing.T) {
	normalized, err := NormalizeCustomRule(detection.Rule{
		Name:        "Possible repeated sudo",
		Description: "Possible privilege elevation attempts",
		Severity:    "HIGH",
		Condition: detection.Condition{
			Source:          "authlog",
			Category:        "auth",
			MessageContains: "sudo",
		},
		GroupBy: []string{"src_ip"},
		Threshold: &detection.Threshold{
			Count:         3,
			WindowSeconds: 300,
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	if normalized.ID != "custom.possible-repeated-sudo" {
		t.Fatalf("id %q", normalized.ID)
	}
	if normalized.Severity != "high" {
		t.Fatalf("severity %q", normalized.Severity)
	}
	if normalized.Action.Title != "Possible repeated sudo" {
		t.Fatalf("title %q", normalized.Action.Title)
	}
	def, err := CustomRuleDefinition(normalized)
	if err != nil {
		t.Fatal(err)
	}
	parsed, err := ParseRuleDefinition(def)
	if err != nil {
		t.Fatal(err)
	}
	if parsed.ID != normalized.ID || parsed.Condition.MessageContains != "sudo" || parsed.Threshold == nil || parsed.Threshold.Count != 3 {
		t.Fatalf("round trip %+v", parsed)
	}
}
