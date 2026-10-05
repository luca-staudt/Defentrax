package sdk

import (
	"fmt"
	"sync"
)

// Factory constructs a Plugin instance. Factories must be pure and side-effect
// free beyond returning a new instance (Init performs real setup).
type Factory func() (Plugin, error)

var (
	regMu    sync.RWMutex
	registry = map[string]Factory{}
)

// Register associates a slug with a factory. Panics on duplicate slug or empty slug.
// Intended for init() in allowlisted plugin packages imported by the host.
func Register(slug string, factory Factory) {
	if slug == "" {
		panic("plugin sdk: Register empty slug")
	}
	if factory == nil {
		panic("plugin sdk: Register nil factory for " + slug)
	}
	regMu.Lock()
	defer regMu.Unlock()
	if _, exists := registry[slug]; exists {
		panic("plugin sdk: duplicate registration for " + slug)
	}
	registry[slug] = factory
}

// Lookup returns the factory for slug, if registered.
func Lookup(slug string) (Factory, bool) {
	regMu.RLock()
	defer regMu.RUnlock()
	f, ok := registry[slug]
	return f, ok
}

// RegisteredSlugs returns sorted slugs currently in the process registry.
func RegisteredSlugs() []string {
	regMu.RLock()
	defer regMu.RUnlock()
	out := make([]string, 0, len(registry))
	for s := range registry {
		out = append(out, s)
	}
	// insertion order not guaranteed; sort for stability in callers that care
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j] < out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}

// New instantiates a registered plugin by slug.
func New(slug string) (Plugin, error) {
	f, ok := Lookup(slug)
	if !ok {
		return nil, fmt.Errorf("plugin %q: not registered in process (import/allowlist required)", slug)
	}
	p, err := f()
	if err != nil {
		return nil, fmt.Errorf("plugin %q: factory: %w", slug, err)
	}
	if p == nil {
		return nil, fmt.Errorf("plugin %q: factory returned nil", slug)
	}
	return p, nil
}

// ResetRegistryForTest clears the registry. Only for tests.
func ResetRegistryForTest() {
	regMu.Lock()
	defer regMu.Unlock()
	registry = map[string]Factory{}
}
