package alerts_test

import (
	"errors"
	"testing"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/alerts"
)

func TestValidateTransitionAllowed(t *testing.T) {
	cases := []struct {
		from, to string
		ok       bool
	}{
		{alerts.StatusOpen, alerts.StatusAcknowledged, true},
		{alerts.StatusOpen, alerts.StatusInvestigating, true},
		{alerts.StatusOpen, alerts.StatusResolved, true},
		{alerts.StatusAcknowledged, alerts.StatusInvestigating, true},
		{alerts.StatusAcknowledged, alerts.StatusResolved, true},
		{alerts.StatusInvestigating, alerts.StatusResolved, true},
		{alerts.StatusResolved, alerts.StatusOpen, true},
		{alerts.StatusResolved, alerts.StatusAcknowledged, false},
		{alerts.StatusAcknowledged, alerts.StatusOpen, false},
		{alerts.StatusInvestigating, alerts.StatusAcknowledged, false},
	}
	for _, c := range cases {
		err := alerts.ValidateTransition(c.from, c.to)
		if c.ok && err != nil {
			t.Fatalf("%s -> %s: expected ok, got %v", c.from, c.to, err)
		}
		if !c.ok && !errors.Is(err, alerts.ErrInvalidTransition) && !errors.Is(err, alerts.ErrTerminalStatus) {
			t.Fatalf("%s -> %s: expected invalid, got %v", c.from, c.to, err)
		}
	}
}
