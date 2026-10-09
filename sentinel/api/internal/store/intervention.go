package store

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// InterventionSettings is the policy for autonomous / admin-triggered host actions.
type InterventionSettings struct {
	ID                uuid.UUID
	Scope             string
	ServerID          *uuid.UUID
	Enabled           bool
	Mode              string
	AllowBlockIP      bool
	AllowKillProcess  bool
	AllowFirewallRule bool
	ProtectedCIDRs    []string
	UpdatedBy         *uuid.UUID
	CreatedAt         time.Time
	UpdatedAt         time.Time
}

// InterventionAction is a requested or executed host intervention.
type InterventionAction struct {
	ID            uuid.UUID
	ServerID      uuid.UUID
	AgentID       *uuid.UUID
	AlertID       *uuid.UUID
	EventID       *uuid.UUID
	ActionType    string
	Payload       json.RawMessage
	Status        string
	ModeAtRequest string
	Reason        string
	RequestedBy   *uuid.UUID
	DecidedBy     *uuid.UUID
	DecidedAt     *time.Time
	QueuedAt      *time.Time
	CompletedAt   *time.Time
	Result        json.RawMessage
	ErrorMessage  string
	CreatedAt     time.Time
	UpdatedAt     time.Time
}

// EffectiveIntervention is the resolved policy for a server (server override wins).
type EffectiveIntervention struct {
	Settings InterventionSettings
	Source   string // global | server
}

var validInterventionModes = map[string]bool{"observe": true, "suggest": true, "act": true}
var validInterventionTypes = map[string]bool{"block_ip": true, "kill_process": true, "firewall_rule": true}

func ValidateInterventionMode(mode string) bool {
	return validInterventionModes[strings.ToLower(strings.TrimSpace(mode))]
}

func ValidateInterventionType(t string) bool {
	return validInterventionTypes[strings.ToLower(strings.TrimSpace(t))]
}

func GetGlobalInterventionSettings(ctx context.Context, pool *pgxpool.Pool) (InterventionSettings, error) {
	row := pool.QueryRow(ctx, `
		SELECT id, scope, server_id, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule,
		       COALESCE(protected_cidrs, '{}'), updated_by, created_at, updated_at
		FROM intervention_settings
		WHERE scope = 'global'
		LIMIT 1
	`)
	s, err := scanInterventionSettings(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InterventionSettings{
				Scope:          "global",
				Enabled:        false,
				Mode:           "observe",
				ProtectedCIDRs: []string{},
			}, nil
		}
		return InterventionSettings{}, err
	}
	return s, nil
}

func GetServerInterventionSettings(ctx context.Context, pool *pgxpool.Pool, serverID uuid.UUID) (*InterventionSettings, error) {
	row := pool.QueryRow(ctx, `
		SELECT id, scope, server_id, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule,
		       COALESCE(protected_cidrs, '{}'), updated_by, created_at, updated_at
		FROM intervention_settings
		WHERE scope = 'server' AND server_id = $1
		LIMIT 1
	`, serverID)
	s, err := scanInterventionSettings(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, nil
		}
		return nil, err
	}
	return &s, nil
}

// ResolveInterventionSettings merges global + optional per-server override.
func ResolveInterventionSettings(ctx context.Context, pool *pgxpool.Pool, serverID uuid.UUID) (EffectiveIntervention, error) {
	global, err := GetGlobalInterventionSettings(ctx, pool)
	if err != nil {
		return EffectiveIntervention{}, err
	}
	override, err := GetServerInterventionSettings(ctx, pool, serverID)
	if err != nil {
		return EffectiveIntervention{}, err
	}
	if override != nil {
		return EffectiveIntervention{Settings: *override, Source: "server"}, nil
	}
	return EffectiveIntervention{Settings: global, Source: "global"}, nil
}

type InterventionSettingsUpdate struct {
	Enabled           *bool
	Mode              *string
	AllowBlockIP      *bool
	AllowKillProcess  *bool
	AllowFirewallRule *bool
	ProtectedCIDRs    []string
	UpdatedBy         *uuid.UUID
}

func UpsertGlobalInterventionSettings(ctx context.Context, pool *pgxpool.Pool, upd InterventionSettingsUpdate) (InterventionSettings, error) {
	cur, err := GetGlobalInterventionSettings(ctx, pool)
	if err != nil {
		return InterventionSettings{}, err
	}
	applyInterventionUpdate(&cur, upd)
	if cur.ID != uuid.Nil {
		row := pool.QueryRow(ctx, `
			UPDATE intervention_settings SET
				enabled = $2, mode = $3, allow_block_ip = $4, allow_kill_process = $5, allow_firewall_rule = $6,
				protected_cidrs = $7, updated_by = $8, updated_at = now()
			WHERE id = $1
			RETURNING id, scope, server_id, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule,
			          COALESCE(protected_cidrs, '{}'), updated_by, created_at, updated_at
		`, cur.ID, cur.Enabled, cur.Mode, cur.AllowBlockIP, cur.AllowKillProcess, cur.AllowFirewallRule, cur.ProtectedCIDRs, upd.UpdatedBy)
		return scanInterventionSettings(row)
	}
	row := pool.QueryRow(ctx, `
		INSERT INTO intervention_settings (
			scope, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule, protected_cidrs, updated_by
		) VALUES ('global', $1, $2, $3, $4, $5, $6, $7)
		RETURNING id, scope, server_id, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule,
		          COALESCE(protected_cidrs, '{}'), updated_by, created_at, updated_at
	`, cur.Enabled, cur.Mode, cur.AllowBlockIP, cur.AllowKillProcess, cur.AllowFirewallRule, cur.ProtectedCIDRs, upd.UpdatedBy)
	return scanInterventionSettings(row)
}

func UpsertServerInterventionSettings(ctx context.Context, pool *pgxpool.Pool, serverID uuid.UUID, upd InterventionSettingsUpdate) (InterventionSettings, error) {
	curPtr, err := GetServerInterventionSettings(ctx, pool, serverID)
	if err != nil {
		return InterventionSettings{}, err
	}
	cur := InterventionSettings{
		Scope:          "server",
		ServerID:       &serverID,
		Enabled:        false,
		Mode:           "observe",
		ProtectedCIDRs: []string{},
	}
	if curPtr != nil {
		cur = *curPtr
	}
	applyInterventionUpdate(&cur, upd)
	if cur.ID != uuid.Nil {
		row := pool.QueryRow(ctx, `
			UPDATE intervention_settings SET
				enabled = $2, mode = $3, allow_block_ip = $4, allow_kill_process = $5, allow_firewall_rule = $6,
				protected_cidrs = $7, updated_by = $8, updated_at = now()
			WHERE id = $1
			RETURNING id, scope, server_id, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule,
			          COALESCE(protected_cidrs, '{}'), updated_by, created_at, updated_at
		`, cur.ID, cur.Enabled, cur.Mode, cur.AllowBlockIP, cur.AllowKillProcess, cur.AllowFirewallRule, cur.ProtectedCIDRs, upd.UpdatedBy)
		return scanInterventionSettings(row)
	}
	row := pool.QueryRow(ctx, `
		INSERT INTO intervention_settings (
			scope, server_id, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule, protected_cidrs, updated_by
		) VALUES ('server', $1, $2, $3, $4, $5, $6, $7, $8)
		RETURNING id, scope, server_id, enabled, mode, allow_block_ip, allow_kill_process, allow_firewall_rule,
		          COALESCE(protected_cidrs, '{}'), updated_by, created_at, updated_at
	`, serverID, cur.Enabled, cur.Mode, cur.AllowBlockIP, cur.AllowKillProcess, cur.AllowFirewallRule, cur.ProtectedCIDRs, upd.UpdatedBy)
	return scanInterventionSettings(row)
}

func DeleteServerInterventionSettings(ctx context.Context, pool *pgxpool.Pool, serverID uuid.UUID) error {
	_, err := pool.Exec(ctx, `DELETE FROM intervention_settings WHERE scope = 'server' AND server_id = $1`, serverID)
	return err
}

func applyInterventionUpdate(cur *InterventionSettings, upd InterventionSettingsUpdate) {
	if upd.Enabled != nil {
		cur.Enabled = *upd.Enabled
	}
	if upd.Mode != nil {
		cur.Mode = strings.ToLower(strings.TrimSpace(*upd.Mode))
	}
	if upd.AllowBlockIP != nil {
		cur.AllowBlockIP = *upd.AllowBlockIP
	}
	if upd.AllowKillProcess != nil {
		cur.AllowKillProcess = *upd.AllowKillProcess
	}
	if upd.AllowFirewallRule != nil {
		cur.AllowFirewallRule = *upd.AllowFirewallRule
	}
	if upd.ProtectedCIDRs != nil {
		cur.ProtectedCIDRs = upd.ProtectedCIDRs
	}
	if cur.ProtectedCIDRs == nil {
		cur.ProtectedCIDRs = []string{}
	}
}

type InterventionActionCreate struct {
	ServerID      uuid.UUID
	AgentID       *uuid.UUID
	AlertID       *uuid.UUID
	EventID       *uuid.UUID
	ActionType    string
	Payload       json.RawMessage
	Status        string
	ModeAtRequest string
	Reason        string
	RequestedBy   *uuid.UUID
}

func CreateInterventionAction(ctx context.Context, pool *pgxpool.Pool, p InterventionActionCreate) (InterventionAction, error) {
	if p.Payload == nil {
		p.Payload = json.RawMessage(`{}`)
	}
	if p.Status == "" {
		p.Status = "pending"
	}
	row := pool.QueryRow(ctx, `
		INSERT INTO intervention_actions (
			server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason, requested_by
		) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10)
		RETURNING id, server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason,
		          requested_by, decided_by, decided_at, queued_at, completed_at, result, error_message, created_at, updated_at
	`, p.ServerID, p.AgentID, p.AlertID, p.EventID, p.ActionType, p.Payload, p.Status, p.ModeAtRequest, p.Reason, p.RequestedBy)
	return scanInterventionAction(row)
}

type InterventionActionListFilter struct {
	ServerID uuid.UUID
	Status   string
	Limit    int
	Offset   int
}

func ListInterventionActions(ctx context.Context, pool *pgxpool.Pool, f InterventionActionListFilter) ([]InterventionAction, int, error) {
	limit := f.Limit
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	offset := f.Offset
	if offset < 0 {
		offset = 0
	}
	where := []string{"1=1"}
	args := []any{}
	n := 1
	if f.ServerID != uuid.Nil {
		where = append(where, fmt.Sprintf("server_id = $%d", n))
		args = append(args, f.ServerID)
		n++
	}
	if s := strings.TrimSpace(f.Status); s != "" {
		where = append(where, fmt.Sprintf("status = $%d", n))
		args = append(args, s)
		n++
	}
	clause := strings.Join(where, " AND ")
	var total int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM intervention_actions WHERE `+clause, args...).Scan(&total); err != nil {
		return nil, 0, err
	}
	args = append(args, limit, offset)
	rows, err := pool.Query(ctx, `
		SELECT id, server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason,
		       requested_by, decided_by, decided_at, queued_at, completed_at, result, error_message, created_at, updated_at
		FROM intervention_actions
		WHERE `+clause+`
		ORDER BY created_at DESC
		LIMIT $`+fmt.Sprintf("%d", n)+` OFFSET $`+fmt.Sprintf("%d", n+1), args...)
	if err != nil {
		return nil, 0, err
	}
	defer rows.Close()
	out := make([]InterventionAction, 0)
	for rows.Next() {
		a, err := scanInterventionAction(rows)
		if err != nil {
			return nil, 0, err
		}
		out = append(out, a)
	}
	return out, total, rows.Err()
}

func GetInterventionAction(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (InterventionAction, error) {
	row := pool.QueryRow(ctx, `
		SELECT id, server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason,
		       requested_by, decided_by, decided_at, queued_at, completed_at, result, error_message, created_at, updated_at
		FROM intervention_actions WHERE id = $1
	`, id)
	a, err := scanInterventionAction(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InterventionAction{}, ErrNotFound
		}
		return InterventionAction{}, err
	}
	return a, nil
}

func DecideInterventionAction(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, approve bool, decidedBy uuid.UUID) (InterventionAction, error) {
	status := "denied"
	if approve {
		status = "queued"
	}
	row := pool.QueryRow(ctx, `
		UPDATE intervention_actions
		SET status = $2,
		    decided_by = $3,
		    decided_at = now(),
		    queued_at = CASE WHEN $2 = 'queued' THEN now() ELSE queued_at END,
		    updated_at = now()
		WHERE id = $1 AND status = 'pending'
		RETURNING id, server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason,
		          requested_by, decided_by, decided_at, queued_at, completed_at, result, error_message, created_at, updated_at
	`, id, status, decidedBy)
	a, err := scanInterventionAction(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InterventionAction{}, ErrNotFound
		}
		return InterventionAction{}, err
	}
	return a, nil
}

// ListQueuedInterventionActionsForAgent returns actions the agent should execute.
func ListQueuedInterventionActionsForAgent(ctx context.Context, pool *pgxpool.Pool, agentID, serverID uuid.UUID, limit int) ([]InterventionAction, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	rows, err := pool.Query(ctx, `
		SELECT id, server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason,
		       requested_by, decided_by, decided_at, queued_at, completed_at, result, error_message, created_at, updated_at
		FROM intervention_actions
		WHERE server_id = $1
		  AND status = 'queued'
		  AND (agent_id IS NULL OR agent_id = $2)
		ORDER BY created_at ASC
		LIMIT $3
	`, serverID, agentID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]InterventionAction, 0)
	for rows.Next() {
		a, err := scanInterventionAction(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func MarkInterventionActionRunning(ctx context.Context, pool *pgxpool.Pool, id, agentID uuid.UUID) (InterventionAction, error) {
	row := pool.QueryRow(ctx, `
		UPDATE intervention_actions
		SET status = 'running', agent_id = $2, updated_at = now()
		WHERE id = $1 AND status = 'queued'
		RETURNING id, server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason,
		          requested_by, decided_by, decided_at, queued_at, completed_at, result, error_message, created_at, updated_at
	`, id, agentID)
	a, err := scanInterventionAction(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InterventionAction{}, ErrNotFound
		}
		return InterventionAction{}, err
	}
	return a, nil
}

func CompleteInterventionAction(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, success bool, result json.RawMessage, errMsg string) (InterventionAction, error) {
	status := "failed"
	if success {
		status = "succeeded"
	}
	if result == nil {
		result = json.RawMessage(`{}`)
	}
	row := pool.QueryRow(ctx, `
		UPDATE intervention_actions
		SET status = $2, result = $3::jsonb, error_message = $4, completed_at = now(), updated_at = now()
		WHERE id = $1 AND status IN ('queued', 'running')
		RETURNING id, server_id, agent_id, alert_id, event_id, action_type, payload, status, mode_at_request, reason,
		          requested_by, decided_by, decided_at, queued_at, completed_at, result, error_message, created_at, updated_at
	`, id, status, result, errMsg)
	a, err := scanInterventionAction(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return InterventionAction{}, ErrNotFound
		}
		return InterventionAction{}, err
	}
	return a, nil
}

type scannable interface {
	Scan(dest ...any) error
}

func scanInterventionSettings(row scannable) (InterventionSettings, error) {
	var s InterventionSettings
	var serverID *uuid.UUID
	err := row.Scan(
		&s.ID, &s.Scope, &serverID, &s.Enabled, &s.Mode, &s.AllowBlockIP, &s.AllowKillProcess, &s.AllowFirewallRule,
		&s.ProtectedCIDRs, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt,
	)
	if err != nil {
		return InterventionSettings{}, err
	}
	s.ServerID = serverID
	if s.ProtectedCIDRs == nil {
		s.ProtectedCIDRs = []string{}
	}
	return s, nil
}

func scanInterventionAction(row scannable) (InterventionAction, error) {
	var a InterventionAction
	err := row.Scan(
		&a.ID, &a.ServerID, &a.AgentID, &a.AlertID, &a.EventID, &a.ActionType, &a.Payload, &a.Status, &a.ModeAtRequest, &a.Reason,
		&a.RequestedBy, &a.DecidedBy, &a.DecidedAt, &a.QueuedAt, &a.CompletedAt, &a.Result, &a.ErrorMessage, &a.CreatedAt, &a.UpdatedAt,
	)
	if err != nil {
		return InterventionAction{}, err
	}
	if a.Payload == nil {
		a.Payload = json.RawMessage(`{}`)
	}
	if a.Result == nil {
		a.Result = json.RawMessage(`{}`)
	}
	return a, nil
}
