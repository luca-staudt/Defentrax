// Command bootstrap-admin creates the first platform administrator on an empty database.
package main

import (
	"context"
	"fmt"
	"os"
	"strings"
	"time"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/crypto/password"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/db"
	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

func main() {
	dsn := strings.TrimSpace(os.Getenv("DATABASE_URL"))
	if dsn == "" {
		fmt.Fprintln(os.Stderr, "DATABASE_URL is required")
		os.Exit(1)
	}
	email := strings.TrimSpace(os.Getenv("SENTINEL_BOOTSTRAP_ADMIN_EMAIL"))
	pass := os.Getenv("SENTINEL_BOOTSTRAP_ADMIN_PASSWORD")
	if email == "" || pass == "" {
		fmt.Fprintln(os.Stderr, "set SENTINEL_BOOTSTRAP_ADMIN_EMAIL and SENTINEL_BOOTSTRAP_ADMIN_PASSWORD")
		os.Exit(1)
	}
	if len(pass) < 12 {
		fmt.Fprintln(os.Stderr, "password must be at least 12 characters")
		os.Exit(1)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	pool, err := db.OpenPool(ctx, dsn)
	if err != nil {
		fmt.Fprintf(os.Stderr, "database: %v\n", err)
		os.Exit(1)
	}
	defer pool.Close()

	n, err := store.CountUsers(ctx, pool)
	if err != nil {
		fmt.Fprintf(os.Stderr, "count users: %v\n", err)
		os.Exit(1)
	}
	if n > 0 {
		fmt.Fprintln(os.Stderr, "refusing bootstrap: users already exist")
		os.Exit(1)
	}

	hash, err := password.Hash(pass)
	if err != nil {
		fmt.Fprintf(os.Stderr, "hash: %v\n", err)
		os.Exit(1)
	}
	id, err := store.CreateUser(ctx, pool, strings.ToLower(email), hash, "Administrator")
	if err != nil {
		fmt.Fprintf(os.Stderr, "create user: %v\n", err)
		os.Exit(1)
	}
	if err := store.SetUserRoles(ctx, pool, id, []string{"ADMIN"}, nil); err != nil {
		fmt.Fprintf(os.Stderr, "assign role: %v\n", err)
		os.Exit(1)
	}
	_ = store.Audit(ctx, pool, &id, "user", "user.created", "user", &id, map[string]any{"bootstrap": "cli"}, nil, "bootstrap-admin")
	fmt.Printf("admin user created: %s (id=%s)\n", email, id)
}
