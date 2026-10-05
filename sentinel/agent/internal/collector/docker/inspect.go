package docker

import (
	"path"
	"strings"
)

// sensitiveHostPaths are host paths that, when bind-mounted into a container,
// may indicate elevated risk. Matching is exact or prefix for directories.
var sensitiveHostPaths = []string{
	"/",
	"/etc",
	"/etc/shadow",
	"/etc/passwd",
	"/proc",
	"/sys",
	"/root",
	"/boot",
	"/var/run/docker.sock",
	"/run/docker.sock",
}

// DeriveRiskFlags inspects HostConfig and Mounts (observe-only; never mutates the container).
func DeriveRiskFlags(insp *ContainerInspect) RiskFlags {
	var flags RiskFlags
	if insp == nil {
		return flags
	}
	if insp.HostConfig != nil {
		flags.Privileged = insp.HostConfig.Privileged
		flags.NetworkMode = insp.HostConfig.NetworkMode
		flags.HostNetwork = isHostMode(insp.HostConfig.NetworkMode)
		flags.HostPID = isHostMode(insp.HostConfig.PidMode)
	}

	seen := map[string]struct{}{}
	addMount := func(src string) {
		src = normalizePath(src)
		if src == "" {
			return
		}
		if _, ok := seen[src]; ok {
			return
		}
		seen[src] = struct{}{}
		flags.MountSources = append(flags.MountSources, src)
		if isDockerSocket(src) {
			flags.DockerSocketMount = true
			return
		}
		if isSensitiveMount(src) {
			flags.SensitiveMount = true
		}
	}

	for _, m := range insp.Mounts {
		addMount(m.Source)
	}
	if insp.HostConfig != nil {
		for _, bind := range insp.HostConfig.Binds {
			host, _, ok := splitBind(bind)
			if ok {
				addMount(host)
			}
		}
	}
	return flags
}

func isHostMode(mode string) bool {
	return strings.EqualFold(strings.TrimSpace(mode), "host")
}

func isDockerSocket(src string) bool {
	base := path.Base(src)
	return base == "docker.sock" || src == "/var/run/docker.sock" || src == "/run/docker.sock"
}

func isSensitiveMount(src string) bool {
	if isDockerSocket(src) {
		return false
	}
	src = normalizePath(src)
	for _, p := range sensitiveHostPaths {
		if p == "/" {
			if src == "/" {
				return true
			}
			continue
		}
		if isDockerSocket(p) {
			continue
		}
		if src == p || strings.HasPrefix(src, p+"/") {
			return true
		}
	}
	return false
}

func normalizePath(p string) string {
	p = strings.TrimSpace(p)
	if p == "" {
		return ""
	}
	// Bind specs sometimes include SELinux labels after a trailing colon segment
	// already stripped by splitBind; collapse duplicate slashes lightly.
	if p != "/" {
		p = strings.TrimRight(p, "/")
	}
	return p
}

func splitBind(bind string) (host, container string, ok bool) {
	bind = strings.TrimSpace(bind)
	if bind == "" {
		return "", "", false
	}
	// format: host:container[:mode]
	parts := strings.Split(bind, ":")
	if len(parts) < 2 {
		return "", "", false
	}
	// Windows drive letters are out of scope for Linux agents.
	host = parts[0]
	container = parts[1]
	if host == "" || container == "" {
		return "", "", false
	}
	return host, container, true
}
