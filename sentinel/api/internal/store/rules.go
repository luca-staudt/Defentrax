package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ErrRuleExists is returned when a rule name or id is already taken.
var ErrRuleExists = errors.New("rule already exists")

// RuleRow is a detection rule persisted in PostgreSQL.
type RuleRow struct {
	ID          uuid.UUID
	Name        string
	Description string
	Enabled     bool
	Severity    string
	Definition  json.RawMessage
	Version     int
	YAMLID      string
	CreatedAt   time.Time
	UpdatedAt   time.Time
}

// RuleUpsert is one bundled rule row for database sync.
type RuleUpsert struct {
	YAMLID      string
	Name        string
	Description string
	Severity    string
	Version     int
	Definition  []byte
}

// SyncBundledRules upserts shipped rules by stable YAML id stored in definition.
func SyncBundledRules(ctx context.Context, pool *pgxpool.Pool, rules []RuleUpsert) error {
	for _, r := range rules {
		locked, err := bundledRuleLocked(ctx, pool, r.YAMLID)
		if err != nil {
			return err
		}
		if locked {
			continue
		}
		def := r.Definition
		if len(def) == 0 {
			def = []byte("{}")
		}
		_, err = pool.Exec(ctx, `
INSERT INTO rules (name, description, enabled, severity, definition, version)
VALUES ($1, $2, TRUE, $3, $4::jsonb, $5)
ON CONFLICT (name) DO UPDATE SET
	description = EXCLUDED.description,
	severity = EXCLUDED.severity,
	definition = EXCLUDED.definition,
	version = EXCLUDED.version,
	updated_at = now()
`, r.Name, r.Description, r.Severity, string(def), r.Version)
		if err != nil {
			return err
		}
	}
	return nil
}

// bundledRuleLocked reports whether an operator edit must survive the next bundled sync.
func bundledRuleLocked(ctx context.Context, pool *pgxpool.Pool, yamlID string) (bool, error) {
	if yamlID == "" {
		return false, nil
	}
	var locked bool
	err := pool.QueryRow(ctx, `
SELECT COALESCE(definition->>'user_modified' = 'true', false)
FROM rules WHERE definition->>'id' = $1
`, yamlID).Scan(&locked)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return locked, nil
}

// ListUserModifiedBundled returns shipped rules an operator has edited.
func ListUserModifiedBundled(ctx context.Context, pool *pgxpool.Pool) ([]RuleRow, error) {
	rows, err := pool.Query(ctx, `
SELECT id, name, description, enabled, severity, definition, version, created_at, updated_at
FROM rules
WHERE definition->>'user_modified' = 'true'
  AND COALESCE(definition->>'origin', '') <> 'custom'
ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RuleRow
	for rows.Next() {
		var r RuleRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.Enabled, &r.Severity, &r.Definition, &r.Version, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.YAMLID = yamlIDFromDefinition(r.Definition)
		out = append(out, r)
	}
	return out, rows.Err()
}

// UpdateRuleContent replaces the editable fields of one rule and keeps its id.
func UpdateRuleContent(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, rule RuleUpsert) (RuleRow, error) {
	def := rule.Definition
	if len(def) == 0 {
		def = []byte("{}")
	}
	var r RuleRow
	err := pool.QueryRow(ctx, `
UPDATE rules SET
	name = $2,
	description = $3,
	severity = $4,
	definition = $5::jsonb,
	version = $6,
	updated_at = now()
WHERE id = $1
RETURNING id, name, description, enabled, severity, definition, version, created_at, updated_at
`, id, rule.Name, rule.Description, rule.Severity, string(def), rule.Version).Scan(
		&r.ID, &r.Name, &r.Description, &r.Enabled, &r.Severity, &r.Definition, &r.Version, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RuleRow{}, ErrNotFound
		}
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return RuleRow{}, ErrRuleExists
		}
		return RuleRow{}, err
	}
	r.YAMLID = yamlIDFromDefinition(r.Definition)
	return r, nil
}

// ListRules returns all rules ordered by name.
func ListRules(ctx context.Context, pool *pgxpool.Pool) ([]RuleRow, error) {
	rows, err := pool.Query(ctx, `
SELECT id, name, description, enabled, severity, definition, version, created_at, updated_at
FROM rules ORDER BY name ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RuleRow
	for rows.Next() {
		var r RuleRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.Enabled, &r.Severity, &r.Definition, &r.Version, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.YAMLID = yamlIDFromDefinition(r.Definition)
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetRuleByID loads one rule.
func GetRuleByID(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (RuleRow, error) {
	var r RuleRow
	err := pool.QueryRow(ctx, `
SELECT id, name, description, enabled, severity, definition, version, created_at, updated_at
FROM rules WHERE id = $1`, id).Scan(&r.ID, &r.Name, &r.Description, &r.Enabled, &r.Severity, &r.Definition, &r.Version, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RuleRow{}, ErrNotFound
		}
		return RuleRow{}, err
	}
	r.YAMLID = yamlIDFromDefinition(r.Definition)
	return r, nil
}

// SetRuleEnabled toggles a rule.
func SetRuleEnabled(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, enabled bool) (RuleRow, error) {
	var r RuleRow
	err := pool.QueryRow(ctx, `
UPDATE rules SET enabled = $2, updated_at = now()
WHERE id = $1
RETURNING id, name, description, enabled, severity, definition, version, created_at, updated_at
`, id, enabled).Scan(&r.ID, &r.Name, &r.Description, &r.Enabled, &r.Severity, &r.Definition, &r.Version, &r.CreatedAt, &r.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return RuleRow{}, ErrNotFound
		}
		return RuleRow{}, err
	}
	r.YAMLID = yamlIDFromDefinition(r.Definition)
	return r, nil
}

// YAMLRuleIDExists reports whether a definition id is already stored.
func YAMLRuleIDExists(ctx context.Context, pool *pgxpool.Pool, yamlID string) (bool, error) {
	var exists bool
	err := pool.QueryRow(ctx, `SELECT EXISTS(SELECT 1 FROM rules WHERE definition->>'id' = $1)`, yamlID).Scan(&exists)
	return exists, err
}

// InsertCustomRule stores an operator-authored rule. The definition must include id and origin.
func InsertCustomRule(ctx context.Context, pool *pgxpool.Pool, rule RuleUpsert) (RuleRow, error) {
	def := rule.Definition
	if len(def) == 0 {
		def = []byte("{}")
	}
	var r RuleRow
	err := pool.QueryRow(ctx, `
INSERT INTO rules (name, description, enabled, severity, definition, version)
VALUES ($1, $2, TRUE, $3, $4::jsonb, $5)
RETURNING id, name, description, enabled, severity, definition, version, created_at, updated_at
`, rule.Name, rule.Description, rule.Severity, string(def), rule.Version).Scan(
		&r.ID, &r.Name, &r.Description, &r.Enabled, &r.Severity, &r.Definition, &r.Version, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return RuleRow{}, ErrRuleExists
		}
		return RuleRow{}, err
	}
	r.YAMLID = yamlIDFromDefinition(r.Definition)
	return r, nil
}

// ListRulesByOrigin returns rules whose definition origin matches, ordered by name.
func ListRulesByOrigin(ctx context.Context, pool *pgxpool.Pool, origin string) ([]RuleRow, error) {
	rows, err := pool.Query(ctx, `
SELECT id, name, description, enabled, severity, definition, version, created_at, updated_at
FROM rules
WHERE definition->>'origin' = $1
ORDER BY name ASC`, origin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []RuleRow
	for rows.Next() {
		var r RuleRow
		if err := rows.Scan(&r.ID, &r.Name, &r.Description, &r.Enabled, &r.Severity, &r.Definition, &r.Version, &r.CreatedAt, &r.UpdatedAt); err != nil {
			return nil, err
		}
		r.YAMLID = yamlIDFromDefinition(r.Definition)
		out = append(out, r)
	}
	return out, rows.Err()
}

// EnabledYAMLRuleIDs returns yaml ids for enabled rules.
func EnabledYAMLRuleIDs(ctx context.Context, pool *pgxpool.Pool) (map[string]bool, error) {
	rows, err := pool.Query(ctx, `SELECT definition->>'id', enabled FROM rules WHERE definition ? 'id'`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make(map[string]bool)
	for rows.Next() {
		var id string
		var enabled bool
		if err := rows.Scan(&id, &enabled); err != nil {
			return nil, err
		}
		if id != "" {
			out[id] = enabled
		}
	}
	return out, rows.Err()
}

// RuleDBIDByYAMLID resolves database UUID for a yaml rule id.
func RuleDBIDByYAMLID(ctx context.Context, pool *pgxpool.Pool, yamlID string) (uuid.UUID, error) {
	var id uuid.UUID
	err := pool.QueryRow(ctx, `SELECT id FROM rules WHERE definition->>'id' = $1`, yamlID).Scan(&id)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return uuid.Nil, ErrNotFound
		}
		return uuid.Nil, err
	}
	return id, nil
}

func yamlIDFromDefinition(def json.RawMessage) string {
	var m map[string]any
	if err := json.Unmarshal(def, &m); err != nil {
		return ""
	}
	if v, ok := m["id"].(string); ok {
		return v
	}
	return ""
}
