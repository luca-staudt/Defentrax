package sdk

import (
	"context"

	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

// Metadata describes a loaded plugin instance.
type Metadata struct {
	Slug        string
	Name        string
	Version     string
	Description string
	Kind        Kind
	APIVersion  int
}

// Plugin is the common lifecycle surface for all extension kinds.
// Implementations MUST only use capabilities exposed by Host — never assume
// filesystem, network, or database access beyond what Host provides.
type Plugin interface {
	Metadata() Metadata
	// Init prepares the plugin with a restricted Host. Called once after load.
	Init(ctx context.Context, host Host) error
	// Close releases resources. Safe to call multiple times.
	Close(ctx context.Context) error
}

// EventParser turns raw log lines (or bytes) into canonical events.
// Supported in v1 (example: echo-parser).
type EventParser interface {
	Plugin
	// SourceID is the event.source value this parser emits (e.g. "echo").
	SourceID() string
	// ParseLine parses one logical log line. Return (nil, nil) to skip.
	ParseLine(ctx context.Context, line string) (*event.CanonicalEvent, error)
}

// NotificationProvider delivers alert notifications through a custom channel.
// Interface is stable in v1; runtime wiring into the dispatcher is later.
type NotificationProvider interface {
	Plugin
	// ChannelType is the notification_channels.channel_type this provider handles.
	ChannelType() string
	Send(ctx context.Context, msg NotificationMessage) error
}

// NotificationMessage is the payload passed to notification providers.
type NotificationMessage struct {
	ChannelID   string
	AlertID     string
	Title       string
	Description string
	Severity    string
	Trigger     string
	Config      map[string]any // non-secret channel config
	Secrets     map[string]any // decrypted secrets for this delivery only
}

// DetectionRuleProvider contributes detection rules (YAML or structured).
// Interface is stable in v1; engine merge is later.
type DetectionRuleProvider interface {
	Plugin
	// Rules returns rule documents (YAML bytes) to merge with bundled packs.
	Rules(ctx context.Context) ([]RuleDocument, error)
}

// RuleDocument is one detection rule contributed by a plugin.
type RuleDocument struct {
	ID       string
	YAML     []byte
	Filename string
}

// DataSource pulls or receives events from an external system.
// Interface is stable in v1; agent/API integration is later.
type DataSource interface {
	Plugin
	// SourceID is the event.source this data source emits.
	SourceID() string
	// Collect yields zero or more events for the given poll. Implementations
	// should respect ctx cancellation and avoid unbounded buffering.
	Collect(ctx context.Context) ([]event.CanonicalEvent, error)
}

// SupportStatus documents what the host actually runs today vs later.
type SupportStatus struct {
	Kind      Kind
	Runtime   string // "loaded" | "interface_only"
	Notes     string
}

// V1Support returns the honest v1 support matrix.
func V1Support() []SupportStatus {
	return []SupportStatus{
		{Kind: KindEventParser, Runtime: "loaded", Notes: "Factory-registered parsers can be loaded and exercised; agent collector wiring is optional/manual in v1."},
		{Kind: KindNotificationProvider, Runtime: "interface_only", Notes: "Interface + load policy ready; dispatcher integration is a follow-up."},
		{Kind: KindDetectionRuleProvider, Runtime: "interface_only", Notes: "Interface + load policy ready; engine merge is a follow-up."},
		{Kind: KindDataSource, Runtime: "interface_only", Notes: "Interface + load policy ready; poll/ingest loop is a follow-up."},
	}
}
