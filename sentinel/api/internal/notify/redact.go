package notify

import (
	"net/url"
	"regexp"
	"strings"
)

var urlPattern = regexp.MustCompile(`(?i)https?://[^\s"'<>\\]+`)

// RedactURLs replaces absolute http(s) URLs so webhook secrets never appear in logs or audit metadata.
func RedactURLs(s string) string {
	if s == "" {
		return s
	}
	return urlPattern.ReplaceAllStringFunc(s, redactOneURL)
}

func redactOneURL(raw string) string {
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return "[redacted-url]"
	}
	return u.Scheme + "://" + u.Host + "/[redacted]"
}

// SafeError returns err.Error() with URLs redacted.
func SafeError(err error) string {
	if err == nil {
		return ""
	}
	return RedactURLs(err.Error())
}

// ContainsWebhookLeak reports whether s still looks like it embeds a webhook path secret.
func ContainsWebhookLeak(s string) bool {
	lower := strings.ToLower(s)
	if strings.Contains(lower, "discord.com/api/webhooks/") && !strings.Contains(lower, "/[redacted]") {
		return true
	}
	if strings.Contains(lower, "hooks.slack.com/services/") && !strings.Contains(lower, "/[redacted]") {
		return true
	}
	return urlPattern.MatchString(s) && !strings.Contains(s, "/[redacted]")
}
