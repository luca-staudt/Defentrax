package store

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// PluginRow is a plugins table record.
type PluginRow struct {
	ID             uuid.UUID
	Slug           string
	Name           string
	Version        string
	Description    string
	Kind           string
	APIVersion     int
	ChecksumSHA256 string
	Signature      string
	SourcePath     string
	LoadStatus     string
	LoadError      string
	Enabled        bool
	CreatedAt      time.Time
	UpdatedAt      time.Time
}

// PluginUpsert is metadata synced from the loader.
type PluginUpsert struct {
	Slug           string
	Name           string
	Version        string
	Description    string
	Kind           string
	APIVersion     int
	ChecksumSHA256 string
	Signature      string
	SourcePath     string
	LoadStatus     string
	LoadError      string
}

// PluginConfigRow is one plugin_configs entry.
type PluginConfigRow struct {
	ID          uuid.UUID
	PluginID    uuid.UUID
	ConfigKey   string
	ConfigValue json.RawMessage
	UpdatedAt   time.Time
}

// UpsertPluginSync inserts or updates plugin metadata from discovery (does not change enabled).
func UpsertPluginSync(ctx context.Context, pool *pgxpool.Pool, u PluginUpsert) (PluginRow, error) {
	var r PluginRow
	err := pool.QueryRow(ctx, `
INSERT INTO plugins (
	slug, name, version, description, kind, api_version,
	checksum_sha256, signature, source_path, load_status, load_error, enabled
) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, FALSE)
ON CONFLICT (slug) DO UPDATE SET
	name = EXCLUDED.name,
	version = EXCLUDED.version,
	description = EXCLUDED.description,
	kind = EXCLUDED.kind,
	api_version = EXCLUDED.api_version,
	checksum_sha256 = EXCLUDED.checksum_sha256,
	signature = EXCLUDED.signature,
	source_path = EXCLUDED.source_path,
	load_status = EXCLUDED.load_status,
	load_error = EXCLUDED.load_error,
	updated_at = now()
RETURNING id, slug, name, version, description, kind, api_version,
	checksum_sha256, signature, source_path, load_status, load_error, enabled, created_at, updated_at
`, u.Slug, u.Name, u.Version, u.Description, u.Kind, u.APIVersion,
		u.ChecksumSHA256, u.Signature, u.SourcePath, u.LoadStatus, u.LoadError,
	).Scan(
		&r.ID, &r.Slug, &r.Name, &r.Version, &r.Description, &r.Kind, &r.APIVersion,
		&r.ChecksumSHA256, &r.Signature, &r.SourcePath, &r.LoadStatus, &r.LoadError,
		&r.Enabled, &r.CreatedAt, &r.UpdatedAt,
	)
	return r, err
}

// ListPlugins returns all plugins ordered by slug.
func ListPlugins(ctx context.Context, pool *pgxpool.Pool) ([]PluginRow, error) {
	rows, err := pool.Query(ctx, `
SELECT id, slug, name, version, description, kind, api_version,
	checksum_sha256, signature, source_path, load_status, load_error, enabled, created_at, updated_at
FROM plugins ORDER BY slug ASC`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PluginRow
	for rows.Next() {
		var r PluginRow
		if err := rows.Scan(
			&r.ID, &r.Slug, &r.Name, &r.Version, &r.Description, &r.Kind, &r.APIVersion,
			&r.ChecksumSHA256, &r.Signature, &r.SourcePath, &r.LoadStatus, &r.LoadError,
			&r.Enabled, &r.CreatedAt, &r.UpdatedAt,
		); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetPluginByID loads one plugin.
func GetPluginByID(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (PluginRow, error) {
	var r PluginRow
	err := pool.QueryRow(ctx, `
SELECT id, slug, name, version, description, kind, api_version,
	checksum_sha256, signature, source_path, load_status, load_error, enabled, created_at, updated_at
FROM plugins WHERE id = $1`, id).Scan(
		&r.ID, &r.Slug, &r.Name, &r.Version, &r.Description, &r.Kind, &r.APIVersion,
		&r.ChecksumSHA256, &r.Signature, &r.SourcePath, &r.LoadStatus, &r.LoadError,
		&r.Enabled, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PluginRow{}, ErrNotFound
		}
		return PluginRow{}, err
	}
	return r, nil
}

// GetPluginBySlug loads one plugin by slug.
func GetPluginBySlug(ctx context.Context, pool *pgxpool.Pool, slug string) (PluginRow, error) {
	var r PluginRow
	err := pool.QueryRow(ctx, `
SELECT id, slug, name, version, description, kind, api_version,
	checksum_sha256, signature, source_path, load_status, load_error, enabled, created_at, updated_at
FROM plugins WHERE slug = $1`, slug).Scan(
		&r.ID, &r.Slug, &r.Name, &r.Version, &r.Description, &r.Kind, &r.APIVersion,
		&r.ChecksumSHA256, &r.Signature, &r.SourcePath, &r.LoadStatus, &r.LoadError,
		&r.Enabled, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PluginRow{}, ErrNotFound
		}
		return PluginRow{}, err
	}
	return r, nil
}

// SetPluginEnabled toggles enabled. When disabling, load_status becomes "disabled".
func SetPluginEnabled(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, enabled bool) (PluginRow, error) {
	var r PluginRow
	err := pool.QueryRow(ctx, `
UPDATE plugins SET
	enabled = $2,
	load_status = CASE WHEN $2 THEN load_status ELSE 'disabled' END,
	updated_at = now()
WHERE id = $1
RETURNING id, slug, name, version, description, kind, api_version,
	checksum_sha256, signature, source_path, load_status, load_error, enabled, created_at, updated_at
`, id, enabled).Scan(
		&r.ID, &r.Slug, &r.Name, &r.Version, &r.Description, &r.Kind, &r.APIVersion,
		&r.ChecksumSHA256, &r.Signature, &r.SourcePath, &r.LoadStatus, &r.LoadError,
		&r.Enabled, &r.CreatedAt, &r.UpdatedAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return PluginRow{}, ErrNotFound
		}
		return PluginRow{}, err
	}
	return r, nil
}

// UpdatePluginLoadState sets load_status/error after instantiate attempts.
func UpdatePluginLoadState(ctx context.Context, pool *pgxpool.Pool, slug, status, loadErr string) error {
	_, err := pool.Exec(ctx, `
UPDATE plugins SET load_status = $2, load_error = $3, updated_at = now() WHERE slug = $1`,
		slug, status, loadErr)
	return err
}

// ListPluginConfigs returns configs for a plugin.
func ListPluginConfigs(ctx context.Context, pool *pgxpool.Pool, pluginID uuid.UUID) ([]PluginConfigRow, error) {
	rows, err := pool.Query(ctx, `
SELECT id, plugin_id, config_key, config_value, updated_at
FROM plugin_configs WHERE plugin_id = $1 ORDER BY config_key ASC`, pluginID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []PluginConfigRow
	for rows.Next() {
		var r PluginConfigRow
		if err := rows.Scan(&r.ID, &r.PluginID, &r.ConfigKey, &r.ConfigValue, &r.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// UpsertPluginConfig sets a config key (JSON value).
func UpsertPluginConfig(ctx context.Context, pool *pgxpool.Pool, pluginID uuid.UUID, key string, value json.RawMessage) (PluginConfigRow, error) {
	if len(value) == 0 {
		value = []byte("null")
	}
	var r PluginConfigRow
	err := pool.QueryRow(ctx, `
INSERT INTO plugin_configs (plugin_id, config_key, config_value)
VALUES ($1, $2, $3::jsonb)
ON CONFLICT (plugin_id, config_key) DO UPDATE SET
	config_value = EXCLUDED.config_value,
	updated_at = now()
RETURNING id, plugin_id, config_key, config_value, updated_at
`, pluginID, key, string(value)).Scan(&r.ID, &r.PluginID, &r.ConfigKey, &r.ConfigValue, &r.UpdatedAt)
	return r, err
}

// DeletePluginConfig removes a config key.
func DeletePluginConfig(ctx context.Context, pool *pgxpool.Pool, pluginID uuid.UUID, key string) error {
	tag, err := pool.Exec(ctx, `DELETE FROM plugin_configs WHERE plugin_id = $1 AND config_key = $2`, pluginID, key)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

// GetPluginConfigMap returns key → decoded JSON value for Host use.
func GetPluginConfigMap(ctx context.Context, pool *pgxpool.Pool, pluginID uuid.UUID) (map[string]any, error) {
	rows, err := ListPluginConfigs(ctx, pool, pluginID)
	if err != nil {
		return nil, err
	}
	out := make(map[string]any, len(rows))
	for _, r := range rows {
		var v any
		if err := json.Unmarshal(r.ConfigValue, &v); err != nil {
			return nil, err
		}
		out[r.ConfigKey] = v
	}
	return out, nil
}

// EnabledPluginSlugs returns slugs with enabled=true.
func EnabledPluginSlugs(ctx context.Context, pool *pgxpool.Pool) (map[string]bool, error) {
	rows, err := pool.Query(ctx, `SELECT slug FROM plugins WHERE enabled = TRUE`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := map[string]bool{}
	for rows.Next() {
		var s string
		if err := rows.Scan(&s); err != nil {
			return nil, err
		}
		out[s] = true
	}
	return out, rows.Err()
}
