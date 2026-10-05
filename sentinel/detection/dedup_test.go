package detection_test

import (
	"testing"

	"github.com/google/uuid"

	"github.com/luca-staudt/Sentinel/sentinel/detection"
)

func TestAlertDedupKeyStable(t *testing.T) {
	serverID := uuid.MustParse("11111111-1111-1111-1111-111111111111")
	group := map[string]string{"src_ip": "10.0.0.1"}
	k1 := detection.AlertDedupKey("rule.a", serverID, group)
	k2 := detection.AlertDedupKey("rule.a", serverID, group)
	if k1 == "" || k1 != k2 {
		t.Fatalf("expected stable dedup key, got %q and %q", k1, k2)
	}
	group2 := map[string]string{"src_ip": "10.0.0.2"}
	k3 := detection.AlertDedupKey("rule.a", serverID, group2)
	if k3 == k1 {
		t.Fatal("expected different dedup keys for different groups")
	}
}
