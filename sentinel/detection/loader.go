package detection

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"strings"

	"gopkg.in/yaml.v3"
)

var ruleSubdirs = []string{"ssh", "linux", "docker", "nginx", "apache", "firewall"}

// LoadRulesFromDir reads YAML rules from category subdirectories under root.
func LoadRulesFromDir(root string) ([]Rule, error) {
	var rules []Rule
	seen := make(map[string]struct{})
	for _, sub := range ruleSubdirs {
		dir := filepath.Join(root, sub)
		info, err := os.Stat(dir)
		if err != nil {
			if os.IsNotExist(err) {
				continue
			}
			return nil, err
		}
		if !info.IsDir() {
			continue
		}
		err = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			if d.IsDir() {
				return nil
			}
			name := strings.ToLower(d.Name())
			if !strings.HasSuffix(name, ".yaml") && !strings.HasSuffix(name, ".yml") {
				return nil
			}
			r, err := LoadRuleFile(path)
			if err != nil {
				return fmt.Errorf("%s: %w", path, err)
			}
			if _, dup := seen[r.ID]; dup {
				return fmt.Errorf("duplicate rule id %q", r.ID)
			}
			seen[r.ID] = struct{}{}
			rules = append(rules, r)
			return nil
		})
		if err != nil {
			return nil, err
		}
	}
	if len(rules) == 0 {
		return nil, fmt.Errorf("no rules found under %s", root)
	}
	return rules, nil
}

// LoadRuleFile parses one YAML rule file.
func LoadRuleFile(path string) (Rule, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return Rule{}, err
	}
	var r Rule
	if err := yaml.Unmarshal(data, &r); err != nil {
		return Rule{}, err
	}
	if r.Version == 0 {
		r.Version = 1
	}
	r.SourceFile = path
	if err := r.Validate(); err != nil {
		return Rule{}, err
	}
	return r, nil
}
