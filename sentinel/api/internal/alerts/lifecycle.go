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
// Forward skips are allowed (e.g. OPEN → RESOLVED). RESOLVED may reopen to OPEN.
func CanTransition(current, next string) bool {
	if current == next {
		return true
	}
	switch current {
	case StatusOpen:
		return next == StatusAcknowledged || next == StatusInvestigating || next == StatusResolved
	case StatusAcknowledged:
		return next == StatusInvestigating || next == StatusResolved
	case StatusInvestigating:
		return next == StatusResolved
	case StatusResolved:
		return next == StatusOpen
	default:
		return false
	}
}

// ValidateTransition returns an error when the transition is not allowed.
func ValidateTransition(current, next string) error {
	if current == next {
		return nil
	}
	if !CanTransition(current, next) {
		if current == StatusResolved {
			return ErrTerminalStatus
		}
		return fmt.Errorf("%w: %s -> %s", ErrInvalidTransition, current, next)
	}
	return nil
}
