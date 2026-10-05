package sessioncookie

import (
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestSetSecureUsesStrictSameSite(t *testing.T) {
	rec := httptest.NewRecorder()
	Set(rec, "sentinel_session", "tok", time.Hour, true)
	cookies := rec.Result().Cookies()
	if len(cookies) != 1 {
		t.Fatalf("cookies=%d", len(cookies))
	}
	c := cookies[0]
	if !c.HttpOnly {
		t.Fatal("HttpOnly required")
	}
	if !c.Secure {
		t.Fatal("Secure required when secure=true")
	}
	if c.SameSite != http.SameSiteStrictMode {
		t.Fatalf("SameSite=%v want Strict", c.SameSite)
	}
	if c.Path != "/" {
		t.Fatalf("Path=%q", c.Path)
	}
}

func TestSetInsecureUsesLaxSameSite(t *testing.T) {
	rec := httptest.NewRecorder()
	Set(rec, "", "tok", time.Hour, false)
	c := rec.Result().Cookies()[0]
	if c.Secure {
		t.Fatal("Secure must be false")
	}
	if c.SameSite != http.SameSiteLaxMode {
		t.Fatalf("SameSite=%v want Lax for local HTTP", c.SameSite)
	}
	if c.Name != defaultName {
		t.Fatalf("default name=%q", c.Name)
	}
}

func TestClearExpiresCookie(t *testing.T) {
	rec := httptest.NewRecorder()
	Clear(rec, "sentinel_session", true)
	c := rec.Result().Cookies()[0]
	if c.MaxAge != -1 {
		t.Fatalf("MaxAge=%d", c.MaxAge)
	}
	if !c.HttpOnly || !c.Secure {
		t.Fatal("clear must keep HttpOnly+Secure flags")
	}
}
