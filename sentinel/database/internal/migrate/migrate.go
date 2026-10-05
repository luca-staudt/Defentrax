package migrate

import (
	"database/sql"
	"fmt"

	"github.com/luca-staudt/Sentinel/sentinel/database/migrations"
	"github.com/pressly/goose/v3"
)

// Run applies or rolls back migrations using goose.
func Run(db *sql.DB, command string) error {
	goose.SetBaseFS(migrations.FS)
	if err := goose.SetDialect("postgres"); err != nil {
		return fmt.Errorf("goose dialect: %w", err)
	}

	dir := "."
	switch command {
	case "up":
		if err := goose.Up(db, dir); err != nil {
			return fmt.Errorf("migrate up: %w", err)
		}
	case "down":
		if err := goose.Down(db, dir); err != nil {
			return fmt.Errorf("migrate down: %w", err)
		}
	case "status":
		if err := goose.Status(db, dir); err != nil {
			return fmt.Errorf("migrate status: %w", err)
		}
	default:
		return fmt.Errorf("unknown migrate command %q (use up, down, status)", command)
	}
	return nil
}
