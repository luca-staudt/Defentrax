package sdk_test

import (
	"context"
	"testing"

	"github.com/luca-staudt/Defentrax/sentinel/plugins/sdk"
)

func TestRegisterLookup(t *testing.T) {
	sdk.ResetRegistryForTest()
	t.Cleanup(sdk.ResetRegistryForTest)

	sdk.Register("unit-test-plugin", func() (sdk.Plugin, error) {
		return &stubPlugin{}, nil
	})
	if _, ok := sdk.Lookup("unit-test-plugin"); !ok {
		t.Fatal("expected lookup hit")
	}
	p, err := sdk.New("unit-test-plugin")
	if err != nil || p == nil {
		t.Fatalf("New: %v %v", p, err)
	}
	if p.Metadata().Slug != "unit-test-plugin" {
		t.Fatalf("metadata slug: %s", p.Metadata().Slug)
	}
}

type stubPlugin struct{}

func (s *stubPlugin) Metadata() sdk.Metadata {
	return sdk.Metadata{Slug: "unit-test-plugin", Name: "stub", Version: "0", Kind: sdk.KindEventParser, APIVersion: sdk.APIVersion}
}
func (s *stubPlugin) Init(ctx context.Context, host sdk.Host) error { return nil }
func (s *stubPlugin) Close(ctx context.Context) error               { return nil }
