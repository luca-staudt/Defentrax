package detection_test

import (
	"path/filepath"
	"testing"

	"github.com/luca-staudt/Defentrax/sentinel/detection"
)

func TestLoadRulesFromDir(t *testing.T) {
	root := filepath.Join("..", "rules")
	rules, err := detection.LoadRulesFromDir(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(rules) < 5 {
		t.Fatalf("expected at least 5 rules, got %d", len(rules))
	}
	ids := make(map[string]struct{})
	for _, r := range rules {
		ids[r.ID] = struct{}{}
	}
	for _, want := range []string{
		"ssh.possible-brute-force",
		"ssh.possible-root-login",
		"linux.possible-sudo-elevation",
		"linux.possible-failed-login",
		"docker.possible-privileged-container",
		"docker.possible-host-network",
		"docker.possible-docker-socket-mount",
		"docker.possible-sensitive-host-mount",
	} {
		if _, ok := ids[want]; !ok {
			t.Fatalf("missing shipped rule %q", want)
		}
	}
}
