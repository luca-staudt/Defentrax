package docker

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

// ParseEngineEvent converts one Docker Engine event JSON object into a canonical
// Sentinel event. Risk enrichment (privileged, mounts, …) is applied when flags
// is non-nil — typically after Inspect on create/start.
func ParseEngineEvent(raw []byte, host string, now time.Time, flags *RiskFlags) (event.CanonicalEvent, bool, error) {
	var eng EngineEvent
	if err := json.Unmarshal(raw, &eng); err != nil {
		return event.CanonicalEvent{}, false, fmt.Errorf("decode docker event: %w", err)
	}
	return EngineEventToCanonical(eng, raw, host, now, flags)
}

// EngineEventToCanonical maps a decoded Engine event to the wire format.
func EngineEventToCanonical(eng EngineEvent, raw []byte, host string, now time.Time, flags *RiskFlags) (event.CanonicalEvent, bool, error) {
	typ := strings.ToLower(strings.TrimSpace(eng.Type))
	action := strings.ToLower(strings.TrimSpace(eng.Action))
	if action == "" {
		action = strings.ToLower(strings.TrimSpace(eng.Status))
	}
	if typ == "" || action == "" {
		return event.CanonicalEvent{}, false, nil
	}

	eventType, category, ok := mapEventType(typ, action)
	if !ok {
		return event.CanonicalEvent{}, false, nil
	}

	occurred := eng.OccurredAt()
	if occurred.IsZero() {
		occurred = now.UTC()
	}

	attrs := eng.Actor.Attributes
	if attrs == nil {
		attrs = map[string]string{}
	}

	containerID := firstNonEmpty(eng.Actor.ID, eng.ID)
	containerName := strings.TrimPrefix(attrs["name"], "/")
	image := firstNonEmpty(attrs["image"], eng.From)

	fields := map[string]any{
		"event_type":    eventType,
		"docker_type":   typ,
		"docker_action": action,
	}
	if containerID != "" {
		fields["container_id"] = shortID(containerID)
		fields["container_id_full"] = containerID
	}
	if containerName != "" {
		fields["container_name"] = containerName
	}
	if image != "" {
		fields["image"] = image
	}
	if attrs["exitCode"] != "" {
		fields["exit_code"] = attrs["exitCode"]
	}

	severity := "info"
	message := humanMessage(eventType, containerName, image)

	if flags != nil {
		applyRiskFlags(fields, flags)
		if flags.Privileged || flags.DockerSocketMount {
			severity = "high"
		} else if flags.HostNetwork || flags.SensitiveMount || flags.HostPID {
			severity = "medium"
		}
		if flags.Privileged {
			message = "Container started with privileged mode"
		} else if flags.DockerSocketMount {
			message = "Container mounts Docker socket"
		} else if flags.SensitiveMount {
			message = "Container mounts sensitive host path"
		} else if flags.HostNetwork {
			message = "Container uses host network"
		}
	}

	fpParts := []string{"docker", eventType, containerID, action, occurred.Format(time.RFC3339Nano)}
	fp := event.Fingerprint(fpParts...)

	rawMsg := raw
	if len(rawMsg) == 0 {
		rawMsg, _ = json.Marshal(eng)
	}

	return event.CanonicalEvent{
		IngestID:    fp,
		OccurredAt:  occurred,
		Source:      "docker",
		Category:    category,
		Severity:    severity,
		Host:        host,
		Message:     message,
		Fields:      fields,
		Fingerprint: fp,
		Raw:         json.RawMessage(rawMsg),
	}, true, nil
}

func mapEventType(typ, action string) (eventType, category string, ok bool) {
	// Strip attributes suffix such as "exec_create: bash"
	if i := strings.IndexByte(action, ':'); i >= 0 {
		action = action[:i]
	}
	switch typ {
	case "container":
		category = "container"
		switch action {
		case "create":
			return "container_create", category, true
		case "start":
			return "container_start", category, true
		case "stop":
			return "container_stop", category, true
		case "die":
			return "container_die", category, true
		case "destroy", "remove":
			return "container_remove", category, true
		case "kill":
			return "container_kill", category, true
		case "pause", "unpause", "restart", "oom", "health_status":
			return "container_" + action, category, true
		default:
			return "", "", false
		}
	case "image":
		category = "image"
		switch action {
		case "pull":
			return "image_pull", category, true
		case "delete", "remove":
			return "image_delete", category, true
		case "tag":
			return "image_tag", category, true
		case "untag":
			return "image_untag", category, true
		case "load", "import", "save", "push":
			return "image_" + action, category, true
		default:
			return "", "", false
		}
	default:
		return "", "", false
	}
}

func applyRiskFlags(fields map[string]any, flags *RiskFlags) {
	fields["privileged"] = boolString(flags.Privileged)
	fields["host_network"] = boolString(flags.HostNetwork)
	fields["host_pid"] = boolString(flags.HostPID)
	fields["docker_socket_mount"] = boolString(flags.DockerSocketMount)
	fields["sensitive_mount"] = boolString(flags.SensitiveMount)
	if flags.NetworkMode != "" {
		fields["network_mode"] = flags.NetworkMode
	}
	if len(flags.MountSources) > 0 {
		fields["mount_sources"] = strings.Join(flags.MountSources, ",")
	}
}

func humanMessage(eventType, name, image string) string {
	label := name
	if label == "" {
		label = image
	}
	if label == "" {
		label = "unknown"
	}
	switch eventType {
	case "container_create":
		return "Container created: " + label
	case "container_start":
		return "Container started: " + label
	case "container_stop":
		return "Container stopped: " + label
	case "container_die":
		return "Container exited: " + label
	case "container_remove":
		return "Container removed: " + label
	case "container_kill":
		return "Container killed: " + label
	case "image_pull":
		return "Image pulled: " + firstNonEmpty(image, label)
	case "image_delete":
		return "Image deleted: " + firstNonEmpty(image, label)
	case "image_tag":
		return "Image tagged: " + firstNonEmpty(image, label)
	case "image_untag":
		return "Image untagged: " + firstNonEmpty(image, label)
	default:
		return "Docker event: " + eventType
	}
}

func boolString(v bool) string {
	if v {
		return "true"
	}
	return "false"
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

func shortID(id string) string {
	if len(id) > 12 {
		return id[:12]
	}
	return id
}
