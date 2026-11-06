package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ── config (XDG, env, flags) ────────────────────────────────────────────────

type Config struct {
	Endpoint string `json:"endpoint"`
	Token    string `json:"token"`
	Project  string `json:"project"`
	AppURL   string `json:"app_url"`
	SafeMode bool   `json:"safe_mode"`
}

func configHome() string {
	if v := os.Getenv("XDG_CONFIG_HOME"); v != "" {
		return filepath.Join(v, "snag")
	}
	h, _ := os.UserHomeDir()
	return filepath.Join(h, ".config", "snag")
}

func configPath() string { return filepath.Join(configHome(), "config.json") }

func loadConfigFile() Config {
	var cfg Config
	cfg.SafeMode = true
	b, err := os.ReadFile(configPath())
	if err == nil {
		_ = json.Unmarshal(b, &cfg)
	}
	return cfg
}

func (cfg Config) save() (string, error) {
	if err := os.MkdirAll(configHome(), 0o700); err != nil {
		return "", err
	}
	b, _ := json.MarshalIndent(cfg, "", "  ")
	path := configPath()
	if err := os.WriteFile(path, append(b, '\n'), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

// resolve merges file < env < flags.
func resolveConfig() Config {
	cfg := loadConfigFile()
	if v := firstNonEmpty(flagEndpoint, os.Getenv("SNAG_ENDPOINT")); v != "" {
		cfg.Endpoint = v
	}
	if v := firstNonEmpty(flagToken, os.Getenv("SNAG_TOKEN")); v != "" {
		cfg.Token = v
	}
	if v := firstNonEmpty(flagProject, os.Getenv("SNAG_PROJECT")); v != "" {
		cfg.Project = v
	}
	cfg.Endpoint = strings.TrimRight(cfg.Endpoint, "/")
	return cfg
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// ── HTTP client ─────────────────────────────────────────────────────────────

type apiError struct {
	msg    string
	status int
}

func (e *apiError) Error() string { return e.msg }

type Client struct{ cfg Config }

func newClient(cfg Config) (*Client, error) {
	if cfg.Endpoint == "" {
		return nil, &apiError{msg: "no Snag endpoint configured: run `snag auth login`"}
	}
	return &Client{cfg: cfg}, nil
}

func (cl *Client) request(path, method string, body any, query map[string]string) (any, error) {
	u := cl.cfg.Endpoint + path
	if len(query) > 0 {
		q := url.Values{}
		for k, v := range query {
			if v != "" {
				q.Set(k, v)
			}
		}
		if enc := q.Encode(); enc != "" {
			if strings.Contains(u, "?") {
				u += "&" + enc
			} else {
				u += "?" + enc
			}
		}
	}
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method, u, reader)
	if err != nil {
		return nil, &apiError{msg: err.Error()}
	}
	req.Header.Set("accept", "application/json")
	if body != nil {
		req.Header.Set("content-type", "application/json")
	}
	if cl.cfg.Token != "" {
		req.Header.Set("authorization", "Bearer "+cl.cfg.Token)
	}
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, &apiError{msg: fmt.Sprintf("cannot reach %s (%v)", cl.cfg.Endpoint, err)}
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		serverMsg := ""
		var e map[string]any
		if json.Unmarshal(raw, &e) == nil {
			if s, ok := e["error"].(string); ok {
				serverMsg = s
			}
		}
		switch {
		case resp.StatusCode == 404:
			msg := serverMsg
			if msg == "" {
				msg = "not found"
			}
			return nil, &apiError{msg: msg, status: 404}
		case resp.StatusCode == 401 || resp.StatusCode == 403:
			return nil, &apiError{msg: "unauthorized: check your token (`snag auth login`)", status: resp.StatusCode}
		default:
			m := fmt.Sprintf("HTTP %d", resp.StatusCode)
			if serverMsg != "" {
				m += ": " + serverMsg
			}
			return nil, &apiError{msg: m, status: resp.StatusCode}
		}
	}
	if len(raw) == 0 {
		return nil, nil
	}
	var out any
	if err := json.Unmarshal(raw, &out); err != nil {
		return string(raw), nil
	}
	return out, nil
}

func (cl *Client) get(path string, query map[string]string) (any, error) {
	return cl.request(path, "GET", nil, query)
}

// project resolves the project id (config, or the single project).
func (cl *Client) project() (string, error) {
	if cl.cfg.Project != "" {
		return cl.cfg.Project, nil
	}
	got, err := cl.get("/api/projects", nil)
	if err != nil {
		return "", err
	}
	if list, ok := got.([]any); ok {
		if len(list) == 1 {
			if m, ok := list[0].(map[string]any); ok {
				return str(m["id"]), nil
			}
		}
		if len(list) > 1 {
			return "", &apiError{msg: "multiple projects: pass --project <id> or set a default with `snag auth login`", status: 2}
		}
	}
	return "", &apiError{msg: "no project configured: run `snag auth login` or pass --project <id>", status: 2}
}
