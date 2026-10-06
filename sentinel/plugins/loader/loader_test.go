package loader_test

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	_ "github.com/luca-staudt/Defentrax/sentinel/plugins/examples/echo-parser"
	"github.com/luca-staudt/Defentrax/sentinel/plugins/loader"
	"github.com/luca-staudt/Defentrax/sentinel/plugins/sdk"
)

func TestInstantiateEchoParser(t *testing.T) {
	root := filepath.Join("..", "examples")
	if st, err := os.Stat(root); err != nil || !st.IsDir() {
		t.Skip("examples dir not present")
	}
	pol := loader.Policy{
		RootDir:   root,
		Allowlist: loader.ParseAllowlist("echo-parser"),
	}
	admitted, rejected, err := loader.Discover(root, pol)
	if err != nil {
		t.Fatal(err)
	}
	if len(admitted) != 1 {
		t.Fatalf("want 1 admitted, got %d rejected=%v", len(admitted), rejected)
	}

	loaded, skipped, err := loader.Instantiate(context.Background(), admitted, func(slug string) sdk.Host {
		return &sdk.StaticHost{}
	}, func(slug string) bool { return true })
	if err != nil {
		t.Fatal(err)
	}
	if len(skipped) > 0 {
		t.Fatalf("unexpected skipped: %v", skipped)
	}
	if len(loaded) != 1 {
		t.Fatalf("want 1 loaded, got %d", len(loaded))
	}
	parser, ok := loaded[0].Instance.(sdk.EventParser)
	if !ok {
		t.Fatalf("expected EventParser, got %T", loaded[0].Instance)
	}
	ev, err := parser.ParseLine(context.Background(), `ECHO level=info msg=hello`)
	if err != nil || ev == nil || ev.Message != "hello" {
		t.Fatalf("parse: ev=%v err=%v", ev, err)
	}
	_ = loaded[0].Instance.Close(context.Background())
}

func TestInstantiateDisabledSkipped(t *testing.T) {
	root := filepath.Join("..", "examples")
	if st, err := os.Stat(root); err != nil || !st.IsDir() {
		t.Skip("examples dir not present")
	}
	pol := loader.Policy{RootDir: root, Allowlist: loader.ParseAllowlist("echo-parser")}
	admitted, _, err := loader.Discover(root, pol)
	if err != nil {
		t.Fatal(err)
	}
	_, skipped, err := loader.Instantiate(context.Background(), admitted, nil, func(slug string) bool {
		return false
	})
	if err != nil {
		t.Fatal(err)
	}
	if skipped["echo-parser"] != "disabled" {
		t.Fatalf("expected disabled skip, got %v", skipped)
	}
}

func TestV1SupportMatrix(t *testing.T) {
	s := sdk.V1Support()
	if len(s) != 4 {
		t.Fatalf("want 4 kinds, got %d", len(s))
	}
	foundLoaded := false
	for _, row := range s {
		if row.Kind == sdk.KindEventParser && row.Runtime == "loaded" {
			foundLoaded = true
		}
		if row.Runtime != "loaded" && row.Runtime != "interface_only" {
			t.Fatalf("unexpected runtime %q", row.Runtime)
		}
	}
	if !foundLoaded {
		t.Fatal("event_parser should be runtime-loaded in v1")
	}
}
