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

	"github.com/luca-staudt/Sentinel/sentinel/pkg/event"
)

// Client talks to the Sentinel control-plane API.
type Client struct {
	baseURL    string
	httpClient *http.Client
	token      string
}

func NewClient(baseURL string, tlsInsecure bool, token string) *Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.TLSClientConfig = &tls.Config{
		MinVersion:         tls.VersionTLS12,
		InsecureSkipVerify: tlsInsecure, //nolint:gosec // explicit dev-only flag
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

func (c *Client) Heartbeat(version string) error {
	body, _ := json.Marshal(map[string]string{"agent_version": version})
	_, err := postJSON[map[string]any](c, "/api/v1/agent/heartbeat", body, c.token)
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
	var zero T
	req, err := http.NewRequest(http.MethodPost, c.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return zero, err
	}
	req.Header.Set("Content-Type", "application/json")
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
