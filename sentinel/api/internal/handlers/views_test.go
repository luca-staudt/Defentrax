package handlers

import (
	"encoding/json"
	"testing"
)

func TestNormalizeViewQueryEventsWithin(t *testing.T) {
	out, err := normalizeViewQuery("events", json.RawMessage(`{"within":"1h","source":"authlog","q":"  failed  ","severity":""}`))
	if err != nil {
		t.Fatal(err)
	}
	var got map[string]string
	if err := json.Unmarshal(out, &got); err != nil {
		t.Fatal(err)
	}
	if got["within"] != "1h" || got["source"] != "authlog" || got["q"] != "failed" {
		t.Fatalf("query = %#v", got)
	}
	if _, ok := got["severity"]; ok {
		t.Fatalf("empty severity should be dropped: %#v", got)
	}
}

func TestNormalizeViewQueryRejectsUnknown(t *testing.T) {
	_, err := normalizeViewQuery("alerts", json.RawMessage(`{"payload":"no"}`))
	if err == nil {
		t.Fatal("expected unknown field to fail")
	}
}
