package handlers

import (
	"encoding/json"
	"testing"

	"github.com/luca-staudt/Defentrax/sentinel/api/internal/store"
)

func TestValidateInterventionPayload(t *testing.T) {
	if err := validateInterventionPayload("block_ip", json.RawMessage(`{"ip":"203.0.113.1"}`)); err != nil {
		t.Fatal(err)
	}
	if err := validateInterventionPayload("block_ip", json.RawMessage(`{"ip":"not-an-ip"}`)); err == nil {
		t.Fatal("expected invalid ip")
	}
	if err := validateInterventionPayload("kill_process", json.RawMessage(`{"pid":1}`)); err == nil {
		t.Fatal("expected pid >= 2")
	}
	if err := validateInterventionPayload("kill_process", json.RawMessage(`{"pid":42}`)); err != nil {
		t.Fatal(err)
	}
	if err := validateInterventionPayload("firewall_rule", json.RawMessage(`{"rule":"-I INPUT -s 1.2.3.4 -j DROP"}`)); err != nil {
		t.Fatal(err)
	}
}

func TestAssertPayloadNotProtected(t *testing.T) {
	payload := json.RawMessage(`{"ip":"10.1.2.3"}`)
	if err := assertPayloadNotProtected([]string{"10.0.0.0/8"}, "block_ip", payload); err == nil {
		t.Fatal("expected protected")
	}
	if err := assertPayloadNotProtected([]string{"192.168.0.0/16"}, "block_ip", payload); err != nil {
		t.Fatal(err)
	}
}

func TestCapabilityAllowed(t *testing.T) {
	s := store.InterventionSettings{AllowBlockIP: true}
	if !capabilityAllowed(s, "block_ip") {
		t.Fatal("expected allow")
	}
	if capabilityAllowed(s, "kill_process") {
		t.Fatal("expected deny")
	}
}
