package echoparser_test

import (
	"context"
	"testing"

	echoparser "github.com/luca-staudt/Sentinel/sentinel/plugins/examples/echo-parser"
	"github.com/luca-staudt/Sentinel/sentinel/plugins/sdk"
)

func TestParseEchoLine(t *testing.T) {
	ev, err := echoparser.ParseEchoLine(`ECHO level=warn msg=disk_almost_full host=web-1 path=/var`)
	if err != nil {
		t.Fatal(err)
	}
	if ev == nil {
		t.Fatal("expected event")
	}
	if ev.Source != "echo" || ev.Message != "disk_almost_full" || ev.Severity != "medium" {
		t.Fatalf("unexpected event: %+v", ev)
	}
	if ev.Fields["path"] != "/var" || ev.Host != "web-1" {
		t.Fatalf("unexpected fields/host: %+v", ev)
	}
}

func TestParseEchoLineSkip(t *testing.T) {
	ev, err := echoparser.ParseEchoLine("INFO something else")
	if err != nil || ev != nil {
		t.Fatalf("expected skip, got ev=%v err=%v", ev, err)
	}
}

func TestPluginImplementsEventParser(t *testing.T) {
	p := &echoparser.Plugin{}
	var _ sdk.EventParser = p
	host := &sdk.StaticHost{Values: map[string]any{"prefix": "demo"}}
	if err := p.Init(context.Background(), host); err != nil {
		t.Fatal(err)
	}
	ev, err := p.ParseLine(context.Background(), `ECHO level=high msg=alert_test`)
	if err != nil || ev == nil || ev.Severity != "high" {
		t.Fatalf("parse via plugin: ev=%v err=%v", ev, err)
	}
	meta := p.Metadata()
	if meta.Slug != "echo-parser" || meta.Kind != sdk.KindEventParser {
		t.Fatalf("metadata: %+v", meta)
	}
}
