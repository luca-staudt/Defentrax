package api

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/google/uuid"

	"github.com/luca-staudt/Defentrax/sentinel/pkg/event"
)

// Client talks to the Defentrax control-plane API.
type Client struct {
	baseURL    string
	httpClient *http.Client
	token      string
}

func NewClient(baseURL string, tlsInsecure bool, token string) *Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.TLSClientConfig = &tls.Config{
		MinVersion: tls.VersionTLS12,
		//nolint:gosec // G402: caller-controlled; only for explicit local/dev TLS bypass
		InsecureSkipVerify: tlsInsecure, // #nosec G402 -- explicit opt-in via config, not default
	}
	return &Client{
		baseURL: baseURL,
		token:   token,
		httpClient: &http.Client{
			Timeout:   30 * time.Second,
			Transport: tr,
		},
	}
}

type enrollRequest struct {
	EnrollmentToken string `json:"enrollment_token"`
	Name            string `json:"name"`
	AgentVersion    string `json:"agent_version"`
}

type enrollResponse struct {
	AgentID     uuid.UUID `json:"agent_id"`
	ServerID    uuid.UUID `json:"server_id"`
	AgentToken  string    `json:"agent_token"`
	TokenPrefix string    `json:"token_prefix"`
}

func (c *Client) Enroll(enrollmentToken, name, version string) (enrollResponse, error) {
	body, _ := json.Marshal(enrollRequest{
		EnrollmentToken: enrollmentToken,
		Name:            name,
		AgentVersion:    version,
	})
	return postJSON[enrollResponse](c, "/api/v1/agent/enroll", body, "")
}

// HeartbeatResponse includes optional intervention policy from the control plane.
type HeartbeatResponse struct {
	Status       string              `json:"status"`
	AgentID      uuid.UUID           `json:"agent_id"`
	ServerID     uuid.UUID           `json:"server_id"`
	Intervention *InterventionPolicy `json:"intervention,omitempty"`
}

type InterventionPolicy struct {
	Enabled        bool            `json:"enabled"`
	Mode           string          `json:"mode"`
	Source         string          `json:"source"`
	DryRun         bool            `json:"dry_run"`
	Capabilities   map[string]bool `json:"capabilities"`
	CanPollActions bool            `json:"can_poll_actions"`
	ProtectedCIDRs []string        `json:"protected_cidrs"`
}

type InterventionAction struct {
	ID         uuid.UUID       `json:"id"`
	ActionType string          `json:"action_type"`
	Payload    json.RawMessage `json:"payload"`
	Status     string          `json:"status"`
}

func (c *Client) Heartbeat(version string) (HeartbeatResponse, error) {
	body, _ := json.Marshal(map[string]string{"agent_version": version})
	return postJSON[HeartbeatResponse](c, "/api/v1/agent/heartbeat", body, c.token)
}

func (c *Client) ListPendingInterventions() ([]InterventionAction, error) {
	resp, err := getJSON[struct {
		Actions []InterventionAction `json:"actions"`
	}](c, "/api/v1/agent/interventions/pending", c.token)
	if err != nil {
		return nil, err
	}
	return resp.Actions, nil
}

func (c *Client) ReportInterventionResult(id uuid.UUID, success bool, result map[string]any, errMsg string) error {
	body, _ := json.Marshal(map[string]any{
		"success": success,
		"result":  result,
		"error":   errMsg,
	})
	_, err := postJSON[map[string]any](c, "/api/v1/agent/interventions/"+id.String()+"/result", body, c.token)
	return err
}

func (c *Client) IngestEvents(events []event.CanonicalEvent) error {
	const batchSize = event.MaxBatchSize
	for start := 0; start < len(events); start += batchSize {
		end := start + batchSize
		if end > len(events) {
			end = len(events)
		}
		if err := c.ingestBatch(events[start:end]); err != nil {
			return err
		}
	}
	return nil
}

func (c *Client) ingestBatch(events []event.CanonicalEvent) error {
	body, _ := json.Marshal(map[string]any{"events": events})
	_, err := postJSON[map[string]any](c, "/api/v1/agent/events", body, c.token)
	return err
}

func postJSON[T any](c *Client, path string, body []byte, bearer string) (T, error) {
	return doJSON[T](c, http.MethodPost, path, body, bearer)
}

func getJSON[T any](c *Client, path string, bearer string) (T, error) {
	return doJSON[T](c, http.MethodGet, path, nil, bearer)
}

func doJSON[T any](c *Client, method, path string, body []byte, bearer string) (T, error) {
	var zero T
	var reader io.Reader
	if body != nil {
		reader = bytes.NewReader(body)
	}
	req, err := http.NewRequest(method, c.baseURL+path, reader)
	if err != nil {
		return zero, err
	}
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if bearer != "" {
		req.Header.Set("Authorization", "Bearer "+bearer)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return zero, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 300 {
		return zero, fmt.Errorf("api %s: status %d: %s", path, resp.StatusCode, truncate(string(respBody), 256))
	}
	if len(respBody) == 0 {
		return zero, nil
	}
	if err := json.Unmarshal(respBody, &zero); err != nil {
		return zero, err
	}
	return zero, nil
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
