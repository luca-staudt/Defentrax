package detection_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/google/uuid"

	"github.com/luca-staudt/Sentinel/sentinel/detection"
)

func loadRule(t *testing.T, id string) detection.Rule {
	t.Helper()
	root := filepath.Join("..", "rules")
	rules, err := detection.LoadRulesFromDir(root)
	if err != nil {
		t.Fatal(err)
	}
	for _, r := range rules {
		if r.ID == id {
			return r
		}
	}
	t.Fatalf("rule %q not found", id)
	return detection.Rule{}
}

func TestSSHBruteForcePositive(t *testing.T) {
	rule := loadRule(t, "ssh.possible-brute-force")
	eng := detection.NewEngine(detection.NewMemoryWindowCounter())
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})

	serverID := uuid.New()
	ctx := context.Background()
	base := detection.Event{
		ServerID: serverID,
		AgentID:  uuid.New(),
		Source:   "authlog",
		Category: "auth",
		Host:     "web1",
		Fields: map[string]any{
			"result":  "failed",
			"program": "sshd",
			"src_ip":  "203.0.113.10",
			"user":    "admin",
		},
	}
	var matches []detection.MatchResult
	for i := 0; i < 4; i++ {
		ev := base
		ev.ID = uuid.New()
		m, err := eng.Evaluate(ctx, ev)
		if err != nil {
			t.Fatal(err)
		}
		matches = append(matches, m...)
	}
	if len(matches) != 0 {
		t.Fatalf("expected no match before threshold, got %d", len(matches))
	}
	ev := base
	ev.ID = uuid.New()
	m, err := eng.Evaluate(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected 1 match on 5th failure, got %d", len(m))
	}
	if m[0].Title == "" {
		t.Fatal("expected title")
	}
}

func TestSSHBruteForceNegative(t *testing.T) {
	rule := loadRule(t, "ssh.possible-brute-force")
	eng := detection.NewEngine(detection.NewMemoryWindowCounter())
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})

	ctx := context.Background()
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "authlog",
		Category: "auth",
		Fields: map[string]any{
			"result":  "success",
			"program": "sshd",
			"src_ip":  "203.0.113.10",
		},
	}
	for i := 0; i < 10; i++ {
		m, err := eng.Evaluate(ctx, ev)
		if err != nil {
			t.Fatal(err)
		}
		if len(m) != 0 {
			t.Fatal("successful login should not count toward brute-force rule")
		}
	}
}

func TestRootLoginPositive(t *testing.T) {
	rule := loadRule(t, "ssh.possible-root-login")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "authlog",
		Category: "auth",
		Host:     "db1",
		Fields: map[string]any{
			"result":  "success",
			"user":    "root",
			"program": "sshd",
			"src_ip":  "198.51.100.2",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match, got %d", len(m))
	}
}

func TestRootLoginNegative(t *testing.T) {
	rule := loadRule(t, "ssh.possible-root-login")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "authlog",
		Category: "auth",
		Fields: map[string]any{
			"result":  "success",
			"user":    "deploy",
			"program": "sshd",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 0 {
		t.Fatal("non-root login should not match")
	}
}

func TestDockerPrivilegedPositive(t *testing.T) {
	rule := loadRule(t, "docker.possible-privileged-container")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "docker",
		Category: "container",
		Host:     "node-a",
		Fields: map[string]any{
			"event_type":     "container_start",
			"privileged":     "true",
			"container_name": "debug",
			"container_id":   "abc123",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match, got %d", len(m))
	}
}

func TestDockerPrivilegedNegative(t *testing.T) {
	rule := loadRule(t, "docker.possible-privileged-container")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "docker",
		Category: "container",
		Fields: map[string]any{
			"event_type": "container_start",
			"privileged": "false",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 0 {
		t.Fatal("non-privileged container should not match")
	}
}

func TestDockerHostNetworkPositive(t *testing.T) {
	rule := loadRule(t, "docker.possible-host-network")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "docker",
		Category: "container",
		Host:     "node-a",
		Fields: map[string]any{
			"event_type":     "container_start",
			"host_network":   "true",
			"container_name": "edge",
			"container_id":   "abc",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match, got %d", len(m))
	}
}

func TestDockerSocketMountPositive(t *testing.T) {
	rule := loadRule(t, "docker.possible-docker-socket-mount")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "docker",
		Category: "container",
		Fields: map[string]any{
			"event_type":          "container_start",
			"docker_socket_mount": "true",
			"container_name":      "tooling",
			"container_id":        "def",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match, got %d", len(m))
	}
}

func TestDockerSensitiveMountPositive(t *testing.T) {
	rule := loadRule(t, "docker.possible-sensitive-host-mount")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "docker",
		Category: "container",
		Fields: map[string]any{
			"event_type":      "container_start",
			"sensitive_mount": "true",
			"mount_sources":   "/",
			"container_name":  "rootfs",
			"container_id":    "ghi",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match, got %d", len(m))
	}
}

func TestSudoPositive(t *testing.T) {
	rule := loadRule(t, "linux.possible-sudo-elevation")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "authlog",
		Category: "auth",
		Host:     "app1",
		Fields: map[string]any{
			"event_type": "sudo",
			"user":       "ops",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match, got %d", len(m))
	}
}

func TestFailedLoginPositive(t *testing.T) {
	rule := loadRule(t, "linux.possible-failed-login")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "authlog",
		Category: "auth",
		Host:     "web1",
		Fields: map[string]any{
			"result": "failed",
			"user":   "guest",
			"src_ip": "203.0.113.9",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match, got %d", len(m))
	}
}

func TestNginxUnauthorizedPositive(t *testing.T) {
	rule := loadRule(t, "nginx.possible-repeated-unauthorized")
	eng := detection.NewEngine(detection.NewMemoryWindowCounter())
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ctx := context.Background()
	base := detection.Event{
		ServerID: uuid.New(),
		Source:   "nginx",
		Category: "network",
		Host:     "edge",
		Fields: map[string]any{
			"status": "401",
			"src_ip": "198.51.100.40",
		},
	}
	for i := 0; i < 9; i++ {
		ev := base
		ev.ID = uuid.New()
		m, err := eng.Evaluate(ctx, ev)
		if err != nil {
			t.Fatal(err)
		}
		if len(m) != 0 {
			t.Fatalf("unexpected early match at %d", i+1)
		}
	}
	ev := base
	ev.ID = uuid.New()
	m, err := eng.Evaluate(ctx, ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 1 {
		t.Fatalf("expected match on 10th 401, got %d", len(m))
	}
}

func TestNginxUnauthorizedNegative(t *testing.T) {
	rule := loadRule(t, "nginx.possible-repeated-unauthorized")
	eng := detection.NewEngine(detection.NewMemoryWindowCounter())
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ctx := context.Background()
	for i := 0; i < 15; i++ {
		m, err := eng.Evaluate(ctx, detection.Event{
			ID:       uuid.New(),
			ServerID: uuid.New(),
			Source:   "nginx",
			Category: "network",
			Fields:   map[string]any{"status": "200", "src_ip": "198.51.100.40"},
		})
		if err != nil {
			t.Fatal(err)
		}
		if len(m) != 0 {
			t.Fatal("HTTP 200 should not match unauthorized rule")
		}
	}
}

func TestFailedLoginNegativeWrongSource(t *testing.T) {
	rule := loadRule(t, "linux.possible-failed-login")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: true})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "nginx",
		Category: "auth",
		Fields:   map[string]any{"result": "failed"},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 0 {
		t.Fatal("wrong source should not match")
	}
}

func TestRuleDisabled(t *testing.T) {
	rule := loadRule(t, "linux.possible-failed-login")
	eng := detection.NewEngine(nil)
	eng.SetRules([]detection.Rule{rule}, map[string]bool{rule.ID: false})
	ev := detection.Event{
		ID:       uuid.New(),
		ServerID: uuid.New(),
		Source:   "authlog",
		Category: "auth",
		Fields: map[string]any{
			"result": "failed",
			"user":   "guest",
		},
	}
	m, err := eng.Evaluate(context.Background(), ev)
	if err != nil {
		t.Fatal(err)
	}
	if len(m) != 0 {
		t.Fatal("disabled rule should not fire")
	}
}
