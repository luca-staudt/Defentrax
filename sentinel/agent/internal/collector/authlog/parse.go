package authlog

import (
	"encoding/json"
	"regexp"
	"strings"
	"time"

	"github.com/luca-staudt/Defentrax/sentinel/pkg/event"
)

var (
	reFailedPassword = regexp.MustCompile(`Failed password for (?:invalid user )?(\S+) from (\S+) port (\d+)`)
	reAcceptedKey    = regexp.MustCompile(`Accepted publickey for (\S+) from (\S+) port (\d+)`)
	reAcceptedPass   = regexp.MustCompile(`Accepted password for (\S+) from (\S+) port (\d+)`)
)

// ParseLine converts a syslog auth line into a canonical event. ok is false when the line is not recognized.
func ParseLine(line string, defaultHost string, now time.Time) (event.CanonicalEvent, bool) {
	line = strings.TrimSpace(line)
	if line == "" {
		return event.CanonicalEvent{}, false
	}
	occurredAt := now.UTC()
	if ts, rest, ok := splitSyslogTimestamp(line); ok {
		occurredAt = ts.UTC()
		line = rest
	}
	msg := extractMessage(line)
	if msg == "" {
		return event.CanonicalEvent{}, false
	}

	raw := map[string]any{"line": line}
	fields := map[string]any{"program": "sshd"}

	if m := reFailedPassword.FindStringSubmatch(msg); len(m) == 4 {
		fields["user"] = m[1]
		fields["src_ip"] = m[2]
		fields["src_port"] = m[3]
		fields["result"] = "failed"
		fp := event.Fingerprint("auth.ssh.failed_password", m[1], m[2], msg)
		return event.CanonicalEvent{
			IngestID:    fp,
			OccurredAt:  occurredAt,
			Source:      "authlog",
			Category:    "auth",
			Severity:    "medium",
			Host:        defaultHost,
			Message:     "SSH failed password attempt",
			Fields:      fields,
			Fingerprint: fp,
			Raw:         mustRaw(raw),
		}, true
	}
	if m := reAcceptedKey.FindStringSubmatch(msg); len(m) == 4 {
		fields["user"] = m[1]
		fields["src_ip"] = m[2]
		fields["src_port"] = m[3]
		fields["result"] = "success"
		fields["method"] = "publickey"
		fp := event.Fingerprint("auth.ssh.accepted_publickey", m[1], m[2], msg)
		return event.CanonicalEvent{
			IngestID:    fp,
			OccurredAt:  occurredAt,
			Source:      "authlog",
			Category:    "auth",
			Severity:    "info",
			Host:        defaultHost,
			Message:     "SSH publickey login accepted",
			Fields:      fields,
			Fingerprint: fp,
			Raw:         mustRaw(raw),
		}, true
	}
	if m := reAcceptedPass.FindStringSubmatch(msg); len(m) == 4 {
		fields["user"] = m[1]
		fields["src_ip"] = m[2]
		fields["src_port"] = m[3]
		fields["result"] = "success"
		fields["method"] = "password"
		fp := event.Fingerprint("auth.ssh.accepted_password", m[1], m[2], msg)
		return event.CanonicalEvent{
			IngestID:    fp,
			OccurredAt:  occurredAt,
			Source:      "authlog",
			Category:    "auth",
			Severity:    "info",
			Host:        defaultHost,
			Message:     "SSH password login accepted",
			Fields:      fields,
			Fingerprint: fp,
			Raw:         mustRaw(raw),
		}, true
	}
	return event.CanonicalEvent{}, false
}

func extractMessage(line string) string {
	idx := strings.Index(line, ": ")
	if idx < 0 {
		return line
	}
	return line[idx+2:]
}

func splitSyslogTimestamp(line string) (time.Time, string, bool) {
	if len(line) < 16 {
		return time.Time{}, line, false
	}
	tsPart := line[:15]
	rest := strings.TrimSpace(line[15:])
	layout := "Jan _2 15:04:05"
	t, err := time.ParseInLocation(layout, tsPart, time.Local)
	if err != nil {
		return time.Time{}, line, false
	}
	year := time.Now().Year()
	t = time.Date(year, t.Month(), t.Day(), t.Hour(), t.Minute(), t.Second(), 0, time.Local)
	return t, rest, true
}

func mustRaw(m map[string]any) json.RawMessage {
	b, _ := json.Marshal(m)
	return b
}
