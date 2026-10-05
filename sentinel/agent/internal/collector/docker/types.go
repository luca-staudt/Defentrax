package docker

import "time"

// EngineEvent is the JSON shape returned by the Docker Engine /events API
// (and by `docker events --format '{{json .}}'`).
type EngineEvent struct {
	Status   string      `json:"status"`
	ID       string      `json:"id"`
	From     string      `json:"from"`
	Type     string      `json:"Type"`
	Action   string      `json:"Action"`
	Actor    EventActor  `json:"Actor"`
	Scope    string      `json:"scope"`
	Time     int64       `json:"time"`
	TimeNano int64       `json:"timeNano"`
}

// EventActor carries identity and attributes for the event subject.
type EventActor struct {
	ID         string            `json:"ID"`
	Attributes map[string]string `json:"Attributes"`
}

// ContainerInspect is the subset of container inspect JSON needed for risk flags.
type ContainerInspect struct {
	ID      string          `json:"Id"`
	Name    string          `json:"Name"`
	Created string          `json:"Created"`
	Config  *ContainerConfig `json:"Config"`
	HostConfig *HostConfig  `json:"HostConfig"`
	Mounts  []Mount         `json:"Mounts"`
}

// ContainerConfig holds image and basic config fields.
type ContainerConfig struct {
	Image string `json:"Image"`
}

// HostConfig holds security-relevant runtime settings.
type HostConfig struct {
	Privileged  bool     `json:"Privileged"`
	NetworkMode string   `json:"NetworkMode"`
	PidMode     string   `json:"PidMode"`
	IpcMode     string   `json:"IpcMode"`
	Binds       []string `json:"Binds"`
}

// Mount is a container mount point from inspect.
type Mount struct {
	Type        string `json:"Type"`
	Source      string `json:"Source"`
	Destination string `json:"Destination"`
	Mode        string `json:"Mode"`
	RW          bool   `json:"RW"`
	Propagation string `json:"Propagation"`
}

// RiskFlags summarizes observe-only security signals derived from inspect.
type RiskFlags struct {
	Privileged        bool
	HostNetwork       bool
	HostPID           bool
	DockerSocketMount bool
	SensitiveMount    bool
	MountSources      []string
	NetworkMode       string
}

// OccurredAt returns the event timestamp in UTC.
func (e EngineEvent) OccurredAt() time.Time {
	if e.TimeNano > 0 {
		return time.Unix(0, e.TimeNano).UTC()
	}
	if e.Time > 0 {
		return time.Unix(e.Time, 0).UTC()
	}
	return time.Time{}
}
