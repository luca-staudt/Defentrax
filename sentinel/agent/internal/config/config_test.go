package config

import (
	"testing"
)

func TestEffectiveInterventionDryRun(t *testing.T) {
	t.Parallel()
	cfg := Config{InterventionDryRun: true}
	if got := cfg.EffectiveInterventionDryRun(false, true); got {
		t.Fatal("without env override, heartbeat dry_run=false should win after heartbeat")
	}
	if got := cfg.EffectiveInterventionDryRun(true, true); !got {
		t.Fatal("heartbeat dry_run=true should win")
	}
	if got := cfg.EffectiveInterventionDryRun(false, false); !got {
		t.Fatal("before heartbeat, safe default true")
	}

	cfg.InterventionDryRunEnvSet = true
	cfg.InterventionDryRun = true
	if got := cfg.EffectiveInterventionDryRun(false, true); !got {
		t.Fatal("env override true should win over heartbeat false")
	}
	cfg.InterventionDryRun = false
	if got := cfg.EffectiveInterventionDryRun(true, true); got {
		t.Fatal("env override false should win over heartbeat true")
	}
}
