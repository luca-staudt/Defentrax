package notify

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/smtp"
	"strings"
	"time"
)

// EmailConfig is the non-secret portion of an email channel.
type EmailConfig struct {
	SMTPHost string   `json:"smtp_host"`
	SMTPPort int      `json:"smtp_port"`
	From     string   `json:"from"`
	To       []string `json:"to"`
	Username string   `json:"username,omitempty"`
	UseTLS   *bool    `json:"use_tls,omitempty"` // reserved; net/smtp STARTTLS path in later hardening
	Subject  string   `json:"subject,omitempty"`
}

// SMTPSendFunc sends a raw email message (injectable for tests).
type SMTPSendFunc func(addr string, a smtp.Auth, from string, to []string, msg []byte) error

// EmailSender delivers alert notifications over SMTP.
type EmailSender struct {
	Send SMTPSendFunc
}

func (s *EmailSender) sendFn() SMTPSendFunc {
	if s.Send != nil {
		return s.Send
	}
	return smtp.SendMail
}

// ParseEmailConfig decodes public email config JSON.
func ParseEmailConfig(raw json.RawMessage) (EmailConfig, error) {
	var c EmailConfig
	if len(raw) == 0 {
		return c, fmt.Errorf("email config required")
	}
	if err := json.Unmarshal(raw, &c); err != nil {
		return c, err
	}
	c.SMTPHost = strings.TrimSpace(c.SMTPHost)
	c.From = strings.TrimSpace(c.From)
	if c.SMTPHost == "" || c.From == "" || len(c.To) == 0 {
		return c, fmt.Errorf("email config requires smtp_host, from, and to")
	}
	if c.SMTPPort <= 0 {
		c.SMTPPort = 587
	}
	return c, nil
}

// Send delivers an email for the alert event.
func (s *EmailSender) SendEmail(ctx context.Context, cfg EmailConfig, password string, ev AlertEvent) error {
	_ = ctx
	subject := cfg.Subject
	if subject == "" {
		subject = fmt.Sprintf("[Defentrax] %s (%s)", ev.Title, strings.ToUpper(ev.Severity))
	}
	body := RenderText(ev)
	msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s",
		cfg.From, strings.Join(cfg.To, ", "), subject, body))

	addr := net.JoinHostPort(cfg.SMTPHost, fmt.Sprintf("%d", cfg.SMTPPort))
	var auth smtp.Auth
	if cfg.Username != "" {
		auth = smtp.PlainAuth("", cfg.Username, password, cfg.SMTPHost)
	}

	done := make(chan error, 1)
	go func() {
		done <- s.sendFn()(addr, auth, cfg.From, cfg.To, msg)
	}()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case err := <-done:
		if err != nil {
			return fmt.Errorf("smtp send failed: %s", SafeError(err))
		}
		return nil
	case <-time.After(15 * time.Second):
		return fmt.Errorf("smtp send timed out")
	}
}
