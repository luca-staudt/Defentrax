package loader

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/luca-staudt/Defentrax/sentinel/plugins/sdk"
)

// Candidate is a discovered, policy-verified plugin ready for registry instantiation.
type Candidate struct {
	Dir      string
	Manifest sdk.Manifest
}

// Loaded is an instantiated plugin after Init.
type Loaded struct {
	Candidate Candidate
	Instance  sdk.Plugin
}

// Discover walks root for */plugin.json, validates manifests, and applies policy.
// Failed plugins are returned in rejected with reasons; discovery itself only
// errors on unreadable root.
func Discover(root string, policy Policy) (admitted []Candidate, rejected map[string]string, err error) {
	rejected = map[string]string{}
	root = strings.TrimSpace(root)
	if root == "" {
		return nil, rejected, nil
	}
	absRoot, err := filepath.Abs(root)
	if err != nil {
		return nil, rejected, err
	}
	policy.RootDir = absRoot

	entries, err := os.ReadDir(absRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, rejected, nil
		}
		return nil, rejected, err
	}

	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		dir := filepath.Join(absRoot, e.Name())
		manifestPath := filepath.Join(dir, "plugin.json")
		if _, err := os.Stat(manifestPath); err != nil {
			continue
		}
		m, err := sdk.LoadManifest(manifestPath)
		if err != nil {
			rejected[e.Name()] = err.Error()
			continue
		}
		if m.Slug != e.Name() {
			rejected[m.Slug] = fmt.Sprintf("directory name %q must match slug %q", e.Name(), m.Slug)
			continue
		}
		if err := policy.VerifyManifest(dir, m); err != nil {
			rejected[m.Slug] = err.Error()
			continue
		}
		admitted = append(admitted, Candidate{Dir: dir, Manifest: m})
	}
	return admitted, rejected, nil
}

// Instantiate creates and Inits plugins for admitted candidates that have a
// process-local factory registration. enableFilter, when non-nil, skips slugs
// for which it returns false (e.g. DB enabled flag).
func Instantiate(ctx context.Context, candidates []Candidate, hostFor func(slug string) sdk.Host, enableFilter func(slug string) bool) (loaded []Loaded, skipped map[string]string, err error) {
	skipped = map[string]string{}
	for _, c := range candidates {
		if enableFilter != nil && !enableFilter(c.Manifest.Slug) {
			skipped[c.Manifest.Slug] = "disabled"
			continue
		}
		if _, ok := sdk.Lookup(c.Manifest.Slug); !ok {
			skipped[c.Manifest.Slug] = "no in-process factory (must be compiled into the host binary)"
			continue
		}
		inst, err := sdk.New(c.Manifest.Slug)
		if err != nil {
			skipped[c.Manifest.Slug] = err.Error()
			continue
		}
		meta := inst.Metadata()
		if meta.Slug != c.Manifest.Slug {
			skipped[c.Manifest.Slug] = "factory metadata slug mismatch"
			_ = inst.Close(ctx)
			continue
		}
		if meta.Kind != c.Manifest.Kind {
			skipped[c.Manifest.Slug] = "factory kind mismatch vs manifest"
			_ = inst.Close(ctx)
			continue
		}
		var host sdk.Host
		if hostFor != nil {
			host = hostFor(c.Manifest.Slug)
		}
		if host == nil {
			host = &sdk.StaticHost{}
		}
		if err := inst.Init(ctx, host); err != nil {
			skipped[c.Manifest.Slug] = "init: " + err.Error()
			_ = inst.Close(ctx)
			continue
		}
		loaded = append(loaded, Loaded{Candidate: c, Instance: inst})
	}
	return loaded, skipped, nil
}
