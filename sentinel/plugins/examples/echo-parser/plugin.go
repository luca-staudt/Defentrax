package echoparser

import (
	"context"

	"github.com/luca-staudt/Defentrax/sentinel/pkg/event"
	"github.com/luca-staudt/Defentrax/sentinel/plugins/sdk"
)

const slug = "echo-parser"

func init() {
	sdk.Register(slug, func() (sdk.Plugin, error) {
		return &Plugin{}, nil
	})
}

// Plugin is the example EventParser demonstration.
type Plugin struct {
	host sdk.Host
}

func (p *Plugin) Metadata() sdk.Metadata {
	return sdk.Metadata{
		Slug:        slug,
		Name:        "Echo Event Parser",
		Version:     "1.0.0",
		Description: "Example parser for ECHO-format log lines (Phase 12 demo)",
		Kind:        sdk.KindEventParser,
		APIVersion:  sdk.APIVersion,
	}
}

func (p *Plugin) Init(ctx context.Context, host sdk.Host) error {
	_ = ctx
	p.host = host
	if host != nil && host.Logger() != nil {
		host.Logger().Info("echo-parser initialized")
	}
	return nil
}

func (p *Plugin) Close(ctx context.Context) error {
	_ = ctx
	return nil
}

func (p *Plugin) SourceID() string { return "echo" }

func (p *Plugin) ParseLine(ctx context.Context, line string) (*event.CanonicalEvent, error) {
	_ = ctx
	return ParseEchoLine(line)
}

// AsEventParser returns the EventParser view (compile-time assertion helper).
func AsEventParser(p *Plugin) sdk.EventParser { return p }
