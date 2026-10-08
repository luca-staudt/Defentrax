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

var ErrViewExists = errors.New("saved view already exists")

type SavedView struct {
	ID        uuid.UUID
	OwnerID   uuid.UUID
	Kind      string
	Name      string
	Query     json.RawMessage
	IsDefault bool
	CreatedAt time.Time
	UpdatedAt time.Time
}

type SavedViewWrite struct {
	OwnerID   uuid.UUID
	Kind      string
	Name      string
	Query     json.RawMessage
	IsDefault bool
}

func ListSavedViews(ctx context.Context, pool *pgxpool.Pool, owner uuid.UUID, kind string) ([]SavedView, error) {
	rows, err := pool.Query(ctx, `
SELECT id, owner_user_id, kind, name, query, is_default, created_at, updated_at
FROM saved_views
WHERE owner_user_id = $1 AND kind = $2
ORDER BY is_default DESC, name ASC
`, owner, kind)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []SavedView
	for rows.Next() {
		view, err := scanSavedView(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, view)
	}
	return out, rows.Err()
}

func GetSavedView(ctx context.Context, pool *pgxpool.Pool, id, owner uuid.UUID) (SavedView, error) {
	row := pool.QueryRow(ctx, `
SELECT id, owner_user_id, kind, name, query, is_default, created_at, updated_at
FROM saved_views WHERE id = $1 AND owner_user_id = $2
`, id, owner)
	view, err := scanSavedView(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return SavedView{}, ErrNotFound
	}
	return view, err
}

func CreateSavedView(ctx context.Context, pool *pgxpool.Pool, in SavedViewWrite) (SavedView, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return SavedView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if in.IsDefault {
		if _, err := tx.Exec(ctx, `UPDATE saved_views SET is_default = false WHERE owner_user_id = $1 AND kind = $2`, in.OwnerID, in.Kind); err != nil {
			return SavedView{}, err
		}
	}
	row := tx.QueryRow(ctx, `
INSERT INTO saved_views (owner_user_id, kind, name, query, is_default)
VALUES ($1, $2, $3, $4::jsonb, $5)
RETURNING id, owner_user_id, kind, name, query, is_default, created_at, updated_at
`, in.OwnerID, in.Kind, in.Name, in.Query, in.IsDefault)
	view, err := scanSavedView(row)
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return SavedView{}, ErrViewExists
		}
		return SavedView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SavedView{}, err
	}
	return view, nil
}

func UpdateSavedView(ctx context.Context, pool *pgxpool.Pool, id uuid.UUID, in SavedViewWrite) (SavedView, error) {
	tx, err := pool.Begin(ctx)
	if err != nil {
		return SavedView{}, err
	}
	defer func() { _ = tx.Rollback(ctx) }()
	if in.IsDefault {
		if _, err := tx.Exec(ctx, `
UPDATE saved_views SET is_default = false
WHERE owner_user_id = $1 AND kind = $2 AND id <> $3
`, in.OwnerID, in.Kind, id); err != nil {
			return SavedView{}, err
		}
	}
	row := tx.QueryRow(ctx, `
UPDATE saved_views
SET name = $3, query = $4::jsonb, is_default = $5, updated_at = now()
WHERE id = $1 AND owner_user_id = $2
RETURNING id, owner_user_id, kind, name, query, is_default, created_at, updated_at
`, id, in.OwnerID, in.Name, in.Query, in.IsDefault)
	view, err := scanSavedView(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return SavedView{}, ErrNotFound
	}
	if err != nil {
		var pgErr *pgconn.PgError
		if errors.As(err, &pgErr) && pgErr.Code == "23505" {
			return SavedView{}, ErrViewExists
		}
		return SavedView{}, err
	}
	if err := tx.Commit(ctx); err != nil {
		return SavedView{}, err
	}
	return view, nil
}

func DeleteSavedView(ctx context.Context, pool *pgxpool.Pool, id, owner uuid.UUID) error {
	tag, err := pool.Exec(ctx, `DELETE FROM saved_views WHERE id = $1 AND owner_user_id = $2`, id, owner)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return ErrNotFound
	}
	return nil
}

type savedViewScanner interface {
	Scan(dest ...any) error
}

func scanSavedView(row savedViewScanner) (SavedView, error) {
	var view SavedView
	err := row.Scan(&view.ID, &view.OwnerID, &view.Kind, &view.Name, &view.Query, &view.IsDefault, &view.CreatedAt, &view.UpdatedAt)
	return view, err
}
