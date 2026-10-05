package echoparser

import (
	"fmt"
	"strings"
	"time"

	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

// ParseEchoLine parses lines of the form:
//
//	ECHO level=<sev> msg=<text> [key=value ...]
//
// Example:
//
//	ECHO level=warn msg=disk_almost_full host=web-1 path=/var
func ParseEchoLine(line string) (*event.CanonicalEvent, error) {
	line = strings.TrimSpace(line)
	if line == "" {
		return nil, nil
	}
	if !strings.HasPrefix(line, "ECHO ") {
		return nil, nil
	}
	rest := strings.TrimSpace(strings.TrimPrefix(line, "ECHO "))
	fields := map[string]any{}
	var msg string
	var level string
	for _, tok := range tokenize(rest) {
		k, v, ok := strings.Cut(tok, "=")
		if !ok {
			return nil, fmt.Errorf("echo-parser: invalid token %q", tok)
		}
		k = strings.TrimSpace(k)
		v = strings.TrimSpace(v)
		if k == "" {
			return nil, fmt.Errorf("echo-parser: empty key")
		}
		switch k {
		case "msg":
			msg = v
		case "level", "severity":
			level = strings.ToLower(v)
		default:
			fields[k] = v
		}
	}
	if msg == "" {
		return nil, fmt.Errorf("echo-parser: msg required")
	}
	sev := normalizeSeverity(level)
	host, _ := fields["host"].(string)
	ev := &event.CanonicalEvent{
		OccurredAt: time.Now().UTC(),
		Source:     "echo",
		Category:   "plugin",
		Severity:   sev,
		Host:       host,
		Message:    msg,
		Fields:     fields,
	}
	return ev, nil
}

func normalizeSeverity(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "info", "low", "medium", "high", "critical":
		return strings.ToLower(s)
	case "warn", "warning":
		return "medium"
	case "err", "error":
		return "high"
	default:
		return "info"
	}
}

// tokenize splits on spaces but keeps quoted values intact (simple).
func tokenize(s string) []string {
	var out []string
	var b strings.Builder
	inQuote := false
	for i := 0; i < len(s); i++ {
		c := s[i]
		switch {
		case c == '"':
			inQuote = !inQuote
		case c == ' ' && !inQuote:
			if b.Len() > 0 {
				out = append(out, b.String())
				b.Reset()
			}
		default:
			b.WriteByte(c)
		}
	}
	if b.Len() > 0 {
		out = append(out, b.String())
	}
	return out
}
