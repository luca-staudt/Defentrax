package migrations

import "embed"

// FS holds SQL migration files for goose.
//
//go:embed *.sql
var FS embed.FS
