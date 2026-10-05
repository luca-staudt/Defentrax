//go:build integration

package handlers

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/luca-staudt/Sentinel/sentinel/api/internal/db"
)

func TestReadyzWithLiveDatabase(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		dsn = "postgres://sentinel_test:sentinel_test@localhost:5432/sentinel_migration_test?sslmode=disable"
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	pool, err := db.OpenPool(ctx, dsn)
	if err != nil {
		t.Skipf("postgres not available: %v", err)
	}
	defer pool.Close()

	r := Readiness{RequireDatabase: true, Pool: pool}
	rec := httptest.NewRecorder()
	r.Ready(rec, httptest.NewRequest(http.MethodGet, "/readyz", nil))

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d body=%s", rec.Code, rec.Body.String())
	}
}
