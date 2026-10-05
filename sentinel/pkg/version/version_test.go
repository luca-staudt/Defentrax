package version

import (
	"regexp"
	"testing"
)

func TestStringIsSemVer(t *testing.T) {
	v := String()
	if v == "" {
		t.Fatal("version string is empty")
	}
	re := regexp.MustCompile(`^\d+\.\d+\.\d+([.-][0-9A-Za-z.-]+)?$`)
	if !re.MatchString(v) {
		t.Fatalf("version %q is not SemVer-like", v)
	}
}

func TestTagHasPrefix(t *testing.T) {
	tag := Tag()
	if tag[0] != 'v' {
		t.Fatalf("Tag() = %q, want leading v", tag)
	}
	if Tag() != "v"+String() && String()[0] != 'v' {
		t.Fatalf("Tag()=%q String()=%q", Tag(), String())
	}
}
