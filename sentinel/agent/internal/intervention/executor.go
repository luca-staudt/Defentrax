package intervention

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"time"

	"github.com/google/uuid"
)

// Action is a queued intervention from the control plane.
type Action struct {
	ID         uuid.UUID
	ActionType string
	Payload    json.RawMessage
}

// Result is reported back to the API.
type Result struct {
	Success bool
	Result  map[string]any
	Error   string
}

// Capabilities from heartbeat.
type Capabilities struct {
	Enabled        bool
	Mode           string
	CanPollActions bool
	BlockIP        bool
	KillProcess    bool
	FirewallRule   bool
	ProtectedCIDRs []string
}

// Execute runs a host intervention when the capability is enabled.
// DryRun=true records what would happen without mutating the host.
func Execute(ctx context.Context, caps Capabilities, action Action, dryRun bool) Result {
	if !caps.Enabled || caps.Mode != "act" {
		return Result{Success: false, Error: "intervention not in act mode"}
	}
	switch action.ActionType {
	case "block_ip":
		if !caps.BlockIP {
			return Result{Success: false, Error: "block_ip capability disabled"}
		}
		return blockIP(ctx, caps, action.Payload, dryRun)
	case "kill_process":
		if !caps.KillProcess {
			return Result{Success: false, Error: "kill_process capability disabled"}
		}
		return killProcess(ctx, action.Payload, dryRun)
	case "firewall_rule":
		if !caps.FirewallRule {
			return Result{Success: false, Error: "firewall_rule capability disabled"}
		}
		return firewallRule(ctx, action.Payload, dryRun)
	default:
		return Result{Success: false, Error: "unknown action_type"}
	}
}

func blockIP(ctx context.Context, caps Capabilities, payload json.RawMessage, dryRun bool) Result {
	var m struct {
		IP string `json:"ip"`
	}
	if err := json.Unmarshal(payload, &m); err != nil {
		return Result{Success: false, Error: "invalid payload"}
	}
	ip := net.ParseIP(strings.TrimSpace(m.IP))
	if ip == nil {
		return Result{Success: false, Error: "invalid ip"}
	}
	if isProtected(caps.ProtectedCIDRs, ip) {
		return Result{Success: false, Error: "target ip is protected"}
	}
	if dryRun {
		return Result{Success: true, Result: map[string]any{"dry_run": true, "would_block": ip.String()}}
	}
	if runtime.GOOS != "linux" {
		return Result{Success: false, Error: "block_ip requires linux"}
	}
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "iptables", "-C", "INPUT", "-s", ip.String(), "-j", "DROP")
	if err := cmd.Run(); err == nil {
		return Result{Success: true, Result: map[string]any{"already_present": true, "ip": ip.String()}}
	}
	cmd = exec.CommandContext(ctx, "iptables", "-I", "INPUT", "-s", ip.String(), "-j", "DROP")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("iptables: %v: %s", err, truncate(string(out), 200))}
	}
	return Result{Success: true, Result: map[string]any{"blocked": ip.String(), "via": "iptables"}}
}

func killProcess(ctx context.Context, payload json.RawMessage, dryRun bool) Result {
	var m struct {
		PID float64 `json:"pid"`
	}
	if err := json.Unmarshal(payload, &m); err != nil {
		return Result{Success: false, Error: "invalid payload"}
	}
	pid := int(m.PID)
	if pid < 2 {
		return Result{Success: false, Error: "pid must be >= 2"}
	}
	if dryRun {
		return Result{Success: true, Result: map[string]any{"dry_run": true, "would_kill": pid}}
	}
	ctx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "kill", "-TERM", strconv.Itoa(pid))
	out, err := cmd.CombinedOutput()
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("kill: %v: %s", err, truncate(string(out), 200))}
	}
	return Result{Success: true, Result: map[string]any{"killed": pid, "signal": "TERM"}}
}

func firewallRule(ctx context.Context, payload json.RawMessage, dryRun bool) Result {
	var m struct {
		Rule string `json:"rule"`
	}
	if err := json.Unmarshal(payload, &m); err != nil {
		return Result{Success: false, Error: "invalid payload"}
	}
	rule := strings.TrimSpace(m.Rule)
	if rule == "" || len(rule) > 512 {
		return Result{Success: false, Error: "invalid rule"}
	}
	// Only allow a narrow iptables-insert form: "-I INPUT … -j DROP|REJECT"
	parts := strings.Fields(rule)
	if len(parts) < 4 || parts[0] != "-I" {
		return Result{Success: false, Error: "firewall_rule must start with -I <chain> …"}
	}
	if dryRun {
		return Result{Success: true, Result: map[string]any{"dry_run": true, "would_apply": rule}}
	}
	if runtime.GOOS != "linux" {
		return Result{Success: false, Error: "firewall_rule requires linux"}
	}
	args := append([]string{}, parts...)
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, "iptables", args...)
	out, err := cmd.CombinedOutput()
	if err != nil {
		return Result{Success: false, Error: fmt.Sprintf("iptables: %v: %s", err, truncate(string(out), 200))}
	}
	return Result{Success: true, Result: map[string]any{"applied": rule}}
}

func isProtected(cidrs []string, ip net.IP) bool {
	for _, c := range cidrs {
		c = strings.TrimSpace(c)
		if c == "" {
			continue
		}
		if _, network, err := net.ParseCIDR(c); err == nil {
			if network.Contains(ip) {
				return true
			}
			continue
		}
		if p := net.ParseIP(c); p != nil && p.Equal(ip) {
			return true
		}
	}
	return false
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
