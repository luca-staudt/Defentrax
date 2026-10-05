package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"time"
)

const dockerAPIVersion = "v1.41"

// API is the Docker Engine surface the collector needs (observe-only).
type API interface {
	Events(ctx context.Context, since time.Time) (io.ReadCloser, error)
	InspectContainer(ctx context.Context, id string) (*ContainerInspect, error)
}

// Client talks to the Docker Engine API over a Unix domain socket.
type Client struct {
	httpClient *http.Client
	socketPath string
}

// NewClient builds an HTTP client dialing the given Docker socket path.
func NewClient(socketPath string) *Client {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(ctx, "unix", socketPath)
		},
	}
	return &Client{
		socketPath: socketPath,
		httpClient: &http.Client{
			Transport: transport,
			// No overall Timeout: /events is a long-lived stream.
		},
	}
}

func (c *Client) Events(ctx context.Context, since time.Time) (io.ReadCloser, error) {
	q := url.Values{}
	if !since.IsZero() {
		q.Set("since", strconv.FormatInt(since.Unix(), 10))
	}
	// Limit to container + image lifecycle signals we care about.
	filters, _ := json.Marshal(map[string][]string{
		"type": {"container", "image"},
	})
	q.Set("filters", string(filters))

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker/"+dockerAPIVersion+"/events?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker events: %w", err)
	}
	if resp.StatusCode != http.StatusOK {
		defer resp.Body.Close()
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("docker events: status %d: %s", resp.StatusCode, string(body))
	}
	return resp.Body, nil
}

func (c *Client) InspectContainer(ctx context.Context, id string) (*ContainerInspect, error) {
	// Bound inspect calls so a hung daemon cannot block the agent forever.
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "http://docker/"+dockerAPIVersion+"/containers/"+url.PathEscape(id)+"/json", nil)
	if err != nil {
		return nil, err
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("docker inspect: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("docker inspect: status %d: %s", resp.StatusCode, string(body))
	}
	var insp ContainerInspect
	if err := json.NewDecoder(io.LimitReader(resp.Body, 4<<20)).Decode(&insp); err != nil {
		return nil, fmt.Errorf("docker inspect decode: %w", err)
	}
	return &insp, nil
}
