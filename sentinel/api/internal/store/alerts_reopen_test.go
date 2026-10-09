package store

import "testing"

func TestTimelineTypeForReopen(t *testing.T) {
	if got := timelineTypeForStatus("OPEN"); got != "reopened" {
		t.Fatalf("OPEN timeline type: got %q want reopened", got)
	}
	if got := timelineTypeForStatus("RESOLVED"); got != "resolved" {
		t.Fatalf("RESOLVED timeline type: got %q want resolved", got)
	}
}
