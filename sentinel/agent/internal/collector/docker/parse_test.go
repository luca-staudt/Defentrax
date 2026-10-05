package docker

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"
)

func loadInspect(t *testing.T, name string) *ContainerInspect {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", name))
	if err != nil {
		t.Fatal(err)
	}
	var insp ContainerInspect
	if err := json.Unmarshal(b, &insp); err != nil {
		t.Fatal(err)
	}
	return &insp
}

func loadEventLines(t *testing.T) [][]byte {
	t.Helper()
	b, err := os.ReadFile(filepath.Join("testdata", "events.ndjson"))
	if err != nil {
		t.Fatal(err)
	}
	var lines [][]byte
	for _, line := range bytes.Split(b, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		lines = append(lines, line)
	}
	return lines
}

func TestParseLifecycleAndImageEvents(t *testing.T) {
	lines := loadEventLines(t)
	inspects := map[string]*ContainerInspect{
		"a1b2c3d4e5f6789012345678abcdef01": loadInspect(t, "inspect_normal.json"),
		"f00dcafe00112233445566778899aabb": loadInspect(t, "inspect_privileged.json"),
		"baddcafebaddcafebaddcafebaddcafe":  loadInspect(t, "inspect_docker_socket.json"),
		"c0ffeec0ffeec0ffeec0ffeec0ffee01":  loadInspect(t, "inspect_host_network.json"),
		"d00dd00dd00dd00dd00dd00dd00dd00d":  loadInspect(t, "inspect_sensitive_mount.json"),
	}
	now := time.Date(2026, 4, 10, 22, 0, 0, 0, time.UTC)
	events, err := ParseLines(lines, "node-a", now, inspects)
	if err != nil {
		t.Fatal(err)
	}
	if len(events) < 10 {
		t.Fatalf("expected at least 10 events, got %d", len(events))
	}

	byType := map[string]int{}
	for _, ev := range events {
		if ev.Source != "docker" {
			t.Fatalf("source: %s", ev.Source)
		}
		et, _ := ev.Fields["event_type"].(string)
		byType[et]++
	}
	for _, want := range []string{
		"container_create", "container_start", "container_stop",
		"container_die", "container_remove", "image_pull", "image_delete",
	} {
		if byType[want] == 0 {
			t.Fatalf("missing event_type %s in %#v", want, byType)
		}
	}
}

func TestPrivilegedRiskFlags(t *testing.T) {
	flags := DeriveRiskFlags(loadInspect(t, "inspect_privileged.json"))
	if !flags.Privileged {
		t.Fatal("expected privileged")
	}
	raw, _ := os.ReadFile(filepath.Join("testdata", "events.ndjson"))
	var startLine []byte
	for _, line := range bytes.Split(raw, []byte("\n")) {
		if bytes.Contains(line, []byte("debug-priv")) {
			startLine = line
			break
		}
	}
	if startLine == nil {
		t.Fatal("fixture line missing")
	}
	f := flags
	ev, ok, err := ParseEngineEvent(startLine, "node-a", time.Now(), &f)
	if err != nil || !ok {
		t.Fatalf("parse: ok=%v err=%v", ok, err)
	}
	if ev.Fields["privileged"] != "true" {
		t.Fatalf("fields: %#v", ev.Fields)
	}
	if ev.Severity != "high" {
		t.Fatalf("severity: %s", ev.Severity)
	}
	if ev.Category != "container" || ev.Fields["event_type"] != "container_start" {
		t.Fatalf("category/type: %s %#v", ev.Category, ev.Fields)
	}
}

func TestDockerSocketMount(t *testing.T) {
	flags := DeriveRiskFlags(loadInspect(t, "inspect_docker_socket.json"))
	if !flags.DockerSocketMount {
		t.Fatal("expected docker socket mount")
	}
	if flags.SensitiveMount {
		t.Fatal("docker.sock should use docker_socket_mount, not sensitive_mount")
	}
}

func TestHostNetwork(t *testing.T) {
	flags := DeriveRiskFlags(loadInspect(t, "inspect_host_network.json"))
	if !flags.HostNetwork {
		t.Fatal("expected host network")
	}
	if flags.NetworkMode != "host" {
		t.Fatalf("network_mode: %s", flags.NetworkMode)
	}
}

func TestSensitiveRootMount(t *testing.T) {
	flags := DeriveRiskFlags(loadInspect(t, "inspect_sensitive_mount.json"))
	if !flags.SensitiveMount {
		t.Fatal("expected sensitive mount")
	}
	if flags.DockerSocketMount {
		t.Fatal("rootfs mount is not docker.sock")
	}
}

func TestNormalContainerNoRisk(t *testing.T) {
	flags := DeriveRiskFlags(loadInspect(t, "inspect_normal.json"))
	if flags.Privileged || flags.HostNetwork || flags.DockerSocketMount || flags.SensitiveMount {
		t.Fatalf("unexpected risk: %#v", flags)
	}
}

func TestIgnoredEventTypes(t *testing.T) {
	raw := []byte(`{"Type":"network","Action":"create","Actor":{"ID":"x"},"time":1}`)
	_, ok, err := ParseEngineEvent(raw, "h", time.Now(), nil)
	if err != nil {
		t.Fatal(err)
	}
	if ok {
		t.Fatal("network events should be ignored")
	}
}

type fakeAPI struct {
	events     string
	inspect    map[string]*ContainerInspect
	eventsOnce sync.Once
	eventsSent bool
}

func (f *fakeAPI) Events(ctx context.Context, since time.Time) (io.ReadCloser, error) {
	_ = ctx
	_ = since
	var body string
	f.eventsOnce.Do(func() {
		body = f.events
		f.eventsSent = true
	})
	if body == "" {
		// Idle stream: block until cancelled (matches a quiet Docker daemon).
		pr, pw := io.Pipe()
		go func() {
			<-ctx.Done()
			_ = pw.CloseWithError(ctx.Err())
		}()
		return pr, nil
	}
	return io.NopCloser(strings.NewReader(body)), nil
}

func (f *fakeAPI) InspectContainer(ctx context.Context, id string) (*ContainerInspect, error) {
	_ = ctx
	if insp, ok := f.inspect[id]; ok {
		return insp, nil
	}
	return nil, io.EOF
}

func TestCollectorDrainWithFakeAPI(t *testing.T) {
	line := `{"status":"start","id":"f00dcafe00112233445566778899aabb","from":"alpine:3.19","Type":"container","Action":"start","Actor":{"ID":"f00dcafe00112233445566778899aabb","Attributes":{"image":"alpine:3.19","name":"debug-priv"}},"time":1712779600,"timeNano":1712779600000000000}` + "\n"
	api := &fakeAPI{
		events: line,
		inspect: map[string]*ContainerInspect{
			"f00dcafe00112233445566778899aabb": loadInspect(t, "inspect_privileged.json"),
		},
	}
	c := NewCollector(api, "node-a")
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- c.Run(ctx) }()

	deadline := time.Now().Add(2 * time.Second)
	var drained []eventLike
	for time.Now().Before(deadline) {
		evs := c.Drain()
		for _, ev := range evs {
			drained = append(drained, eventLike{Source: ev.Source, Privileged: ev.Fields["privileged"]})
		}
		if len(drained) > 0 {
			break
		}
		time.Sleep(20 * time.Millisecond)
	}
	cancel()
	<-done

	if len(drained) != 1 {
		t.Fatalf("expected 1 drained event, got %d", len(drained))
	}
	if drained[0].Source != "docker" || drained[0].Privileged != "true" {
		t.Fatalf("%#v", drained[0])
	}
}

type eventLike struct {
	Source     string
	Privileged any
}

// Ensure collector never exposes mutation helpers (compile-time documentation via API surface).
func TestAPIIsObserveOnly(t *testing.T) {
	var _ API = (*Client)(nil)
}
