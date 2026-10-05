package alerts

import (
	"errors"
	"fmt"
)

// Status values match alerts.status CHECK constraint.
const (
	StatusOpen          = "OPEN"
	StatusAcknowledged  = "ACKNOWLEDGED"
	StatusInvestigating = "INVESTIGATING"
	StatusResolved      = "RESOLVED"
)

var (
	ErrInvalidTransition = errors.New("invalid alert status transition")
	ErrTerminalStatus    = errors.New("alert is resolved")
)

// CanTransition reports whether moving from current to next is allowed.
func CanTransition(current, next string) bool {
	if current == next {
		return true
	}
	switch current {
	case StatusOpen:
		return next == StatusAcknowledged
	case StatusAcknowledged:
		return next == StatusInvestigating
	case StatusInvestigating:
		return next == StatusResolved
	case StatusResolved:
		return false
	default:
		return false
	}
}

// ValidateTransition returns an error when the transition is not allowed.
func ValidateTransition(current, next string) error {
	if current == next {
		return nil
	}
	if current == StatusResolved {
		return ErrTerminalStatus
	}
	if !CanTransition(current, next) {
		return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, current, next)
	}
	return nil
}
