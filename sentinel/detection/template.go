package detection

import (
	"strings"
)

func renderTemplate(tpl string, ev Event, group map[string]string) string {
	out := tpl
	replacements := make(map[string]string)
	for k, v := range group {
		replacements[k] = v
	}
	if ev.Host != "" {
		replacements["host"] = ev.Host
	}
	if ev.Source != "" {
		replacements["source"] = ev.Source
	}
	for k, v := range ev.Fields {
		if s, ok := fieldString(ev.Fields, k); ok {
			replacements[k] = s
			_ = v
		}
	}
	for k, v := range replacements {
		out = strings.ReplaceAll(out, "{{"+k+"}}", v)
	}
	return out
}

func groupKeyValues(rule Rule, ev Event) map[string]string {
	out := make(map[string]string, len(rule.GroupBy))
	for _, k := range rule.GroupBy {
		if s, ok := fieldString(ev.Fields, k); ok {
			out[k] = s
		} else if k == "host" {
			out[k] = ev.Host
		} else if k == "source" {
			out[k] = ev.Source
		} else {
			out[k] = ""
		}
	}
	return out
}

func windowKey(ruleID string, serverID string, group map[string]string) string {
	var b strings.Builder
	b.WriteString(ruleID)
	b.WriteByte('|')
	b.WriteString(serverID)
	for _, k := range sortedGroupKeys(group) {
		b.WriteByte('|')
		b.WriteString(k)
		b.WriteByte('=')
		b.WriteString(group[k])
	}
	return b.String()
}

func sortedGroupKeys(m map[string]string) []string {
	keys := make([]string, 0, len(m))
	for k := range m {
		keys = append(keys, k)
	}
	for i := 0; i < len(keys); i++ {
		for j := i + 1; j < len(keys); j++ {
			if keys[j] < keys[i] {
				keys[i], keys[j] = keys[j], keys[i]
			}
		}
	}
	return keys
}
