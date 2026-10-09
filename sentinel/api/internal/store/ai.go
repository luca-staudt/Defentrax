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

// AIAnalysisSettings is the singleton AI provider configuration.
type AIAnalysisSettings struct {
	ID              uuid.UUID
	Enabled         bool
	Provider        string
	BaseURL         string
	Model           string
	APIKeyEncrypted string
	HasAPIKey       bool
	UpdatedBy       *uuid.UUID
	CreatedAt       time.Time
	UpdatedAt       time.Time
}

// AIAnalysis is a stored possibility-oriented assessment.
type AIAnalysis struct {
	ID           uuid.UUID
	AlertID      *uuid.UUID
	EventID      *uuid.UUID
	Status       string
	Model        string
	Assessment   json.RawMessage
	ErrorMessage string
	CreatedBy    *uuid.UUID
	CreatedAt    time.Time
}

func GetAIAnalysisSettings(ctx context.Context, pool *pgxpool.Pool) (AIAnalysisSettings, error) {
	row := pool.QueryRow(ctx, `
		SELECT id, enabled, provider, base_url, model, api_key_encrypted, has_api_key, updated_by, created_at, updated_at
		FROM ai_analysis_settings
		LIMIT 1
	`)
	var s AIAnalysisSettings
	err := row.Scan(&s.ID, &s.Enabled, &s.Provider, &s.BaseURL, &s.Model, &s.APIKeyEncrypted, &s.HasAPIKey, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AIAnalysisSettings{
				Enabled:  false,
				Provider: "openai",
				BaseURL:  "https://api.openai.com/v1",
				Model:    "gpt-4o-mini",
			}, nil
		}
		return AIAnalysisSettings{}, err
	}
	return s, nil
}

type AIAnalysisSettingsUpdate struct {
	Enabled         *bool
	Provider        *string
	BaseURL         *string
	Model           *string
	APIKeyEncrypted *string
	HasAPIKey       *bool
	UpdatedBy       *uuid.UUID
}

func UpsertAIAnalysisSettings(ctx context.Context, pool *pgxpool.Pool, upd AIAnalysisSettingsUpdate) (AIAnalysisSettings, error) {
	cur, err := GetAIAnalysisSettings(ctx, pool)
	if err != nil {
		return AIAnalysisSettings{}, err
	}
	if upd.Enabled != nil {
		cur.Enabled = *upd.Enabled
	}
	if upd.Provider != nil {
		cur.Provider = *upd.Provider
	}
	if upd.BaseURL != nil {
		cur.BaseURL = *upd.BaseURL
	}
	if upd.Model != nil {
		cur.Model = *upd.Model
	}
	if upd.APIKeyEncrypted != nil {
		cur.APIKeyEncrypted = *upd.APIKeyEncrypted
	}
	if upd.HasAPIKey != nil {
		cur.HasAPIKey = *upd.HasAPIKey
	}
	if cur.ID != uuid.Nil {
		row := pool.QueryRow(ctx, `
			UPDATE ai_analysis_settings SET
				enabled = $2, provider = $3, base_url = $4, model = $5,
				api_key_encrypted = $6, has_api_key = $7, updated_by = $8, updated_at = now()
			WHERE id = $1
			RETURNING id, enabled, provider, base_url, model, api_key_encrypted, has_api_key, updated_by, created_at, updated_at
		`, cur.ID, cur.Enabled, cur.Provider, cur.BaseURL, cur.Model, cur.APIKeyEncrypted, cur.HasAPIKey, upd.UpdatedBy)
		return scanAISettings(row)
	}
	row := pool.QueryRow(ctx, `
		INSERT INTO ai_analysis_settings (enabled, provider, base_url, model, api_key_encrypted, has_api_key, updated_by)
		VALUES ($1,$2,$3,$4,$5,$6,$7)
		RETURNING id, enabled, provider, base_url, model, api_key_encrypted, has_api_key, updated_by, created_at, updated_at
	`, cur.Enabled, cur.Provider, cur.BaseURL, cur.Model, cur.APIKeyEncrypted, cur.HasAPIKey, upd.UpdatedBy)
	return scanAISettings(row)
}

func scanAISettings(row scannable) (AIAnalysisSettings, error) {
	var s AIAnalysisSettings
	err := row.Scan(&s.ID, &s.Enabled, &s.Provider, &s.BaseURL, &s.Model, &s.APIKeyEncrypted, &s.HasAPIKey, &s.UpdatedBy, &s.CreatedAt, &s.UpdatedAt)
	return s, err
}

type AIAnalysisCreate struct {
	AlertID      *uuid.UUID
	EventID      *uuid.UUID
	Status       string
	Model        string
	Assessment   json.RawMessage
	ErrorMessage string
	CreatedBy    *uuid.UUID
}

func CreateAIAnalysis(ctx context.Context, pool *pgxpool.Pool, p AIAnalysisCreate) (AIAnalysis, error) {
	if p.Assessment == nil {
		p.Assessment = json.RawMessage(`{}`)
	}
	if p.Status == "" {
		p.Status = "completed"
	}
	row := pool.QueryRow(ctx, `
		INSERT INTO ai_analyses (alert_id, event_id, status, model, assessment, error_message, created_by)
		VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)
		RETURNING id, alert_id, event_id, status, model, assessment, error_message, created_by, created_at
	`, p.AlertID, p.EventID, p.Status, p.Model, p.Assessment, p.ErrorMessage, p.CreatedBy)
	return scanAIAnalysis(row)
}

func GetAIAnalysis(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID) (AIAnalysis, error) {
	row := pool.QueryRow(ctx, `
		SELECT id, alert_id, event_id, status, model, assessment, error_message, created_by, created_at
		FROM ai_analyses WHERE id = $1
	`, id)
	a, err := scanAIAnalysis(row)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return AIAnalysis{}, ErrNotFound
		}
		return AIAnalysis{}, err
	}
	return a, nil
}

func ListAIAnalyses(ctx context.Context, pool *pgxpool.Pool, alertID *uuid.UUID, limit int) ([]AIAnalysis, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	var rows pgx.Rows
	var err error
	if alertID != nil {
		rows, err = pool.Query(ctx, `
			SELECT id, alert_id, event_id, status, model, assessment, error_message, created_by, created_at
			FROM ai_analyses WHERE alert_id = $1
			ORDER BY created_at DESC LIMIT $2
		`, *alertID, limit)
	} else {
		rows, err = pool.Query(ctx, `
			SELECT id, alert_id, event_id, status, model, assessment, error_message, created_by, created_at
			FROM ai_analyses
			ORDER BY created_at DESC LIMIT $1
		`, limit)
	}
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := make([]AIAnalysis, 0)
	for rows.Next() {
		a, err := scanAIAnalysis(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, rows.Err()
}

func CountRecentAIAnalyses(ctx context.Context, pool *pgxpool.Pool, userID uuid.UUID, since time.Time) (int, error) {
	var n int
	err := pool.QueryRow(ctx, `
		SELECT count(*) FROM ai_analyses
		WHERE created_by = $1 AND created_at >= $2
	`, userID, since).Scan(&n)
	return n, err
}

func scanAIAnalysis(row scannable) (AIAnalysis, error) {
	var a AIAnalysis
	err := row.Scan(&a.ID, &a.AlertID, &a.EventID, &a.Status, &a.Model, &a.Assessment, &a.ErrorMessage, &a.CreatedBy, &a.CreatedAt)
	if err != nil {
		return AIAnalysis{}, err
	}
	if a.Assessment == nil {
		a.Assessment = json.RawMessage(`{}`)
	}
	return a, nil
}
