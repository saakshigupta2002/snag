package main

import (
	"bufio"
	"encoding/json"
	"fmt"
	"os"
)

const mcpProtocol = "2024-11-05"

func mcpTools() []map[string]any {
	obj := func(props map[string]any, req ...string) map[string]any {
		m := map[string]any{"type": "object", "properties": props}
		if len(req) > 0 {
			m["required"] = req
		}
		return m
	}
	s := map[string]any{"type": "string"}
	b := map[string]any{"type": "boolean"}
	return []map[string]any{
		{"name": "snag_list_issues", "description": "List flagged issues, worst first.",
			"inputSchema": obj(map[string]any{"status": s, "severity": s, "detector": s})},
		{"name": "snag_get_issue", "description": "Details for one issue group by groupKey.",
			"inputSchema": obj(map[string]any{"group_key": s}, "group_key")},
		{"name": "snag_list_sessions", "description": "List sessions, most active first.",
			"inputSchema": obj(map[string]any{"errors": b, "bot": b, "device": s, "browser": s})},
		{"name": "snag_get_session_evidence", "description": "A session as a readable transcript.",
			"inputSchema": obj(map[string]any{"session_id": s}, "session_id")},
		{"name": "snag_get_analytics", "description": "Headline analytics over the last N days.",
			"inputSchema": obj(map[string]any{"days": map[string]any{"type": "integer"}})},
		{"name": "snag_get_status", "description": "Ingest health and open/high issue counts.",
			"inputSchema": obj(map[string]any{})},
		{"name": "snag_file_issue",
			"description": "File an AI-flagged issue (a bug you judged real) into Snag, linked to a session's clip. Records a finding for the human to triage; does not fix anything.",
			"inputSchema": obj(map[string]any{"title": s, "severity": s, "session_id": s, "detector": s, "note": s}, "title", "severity")},
	}
}

func mcpCall(name string, args map[string]any) (any, error) {
	cl, err := newClient(resolveConfig())
	if err != nil {
		return nil, err
	}
	pid, err := cl.project()
	if err != nil {
		return nil, err
	}
	sarg := func(k string) string {
		if v, ok := args[k].(string); ok {
			return v
		}
		return ""
	}
	switch name {
	case "snag_list_issues":
		return cl.get("/api/projects/"+pid+"/issues", map[string]string{
			"status": sarg("status"), "severity": sarg("severity"), "detector": sarg("detector")})
	case "snag_get_issue":
		return cl.get("/api/projects/"+pid+"/issues/"+urlEscape(sarg("group_key")), nil)
	case "snag_list_sessions":
		q := map[string]string{"device": sarg("device"), "browser": sarg("browser")}
		if args["errors"] == true {
			q["errors"] = "1"
		}
		if args["bot"] == true {
			q["bot"] = "1"
		}
		return cl.get("/api/projects/"+pid+"/sessions", q)
	case "snag_get_session_evidence":
		got, err := cl.get("/api/sessions/"+urlEscape(sarg("session_id"))+"/events", nil)
		if err != nil {
			return nil, err
		}
		m := asMap(got)
		rows := transcript(asList(m["events"]))
		return map[string]any{"session": evidenceSummary(asMap(m["session"]), rows), "transcript": rows}, nil
	case "snag_get_analytics":
		days := "14"
		if d, ok := args["days"].(float64); ok {
			days = fmt.Sprintf("%d", int(d))
		}
		return cl.get("/api/projects/"+pid+"/analytics", map[string]string{"days": days})
	case "snag_get_status":
		a := asMap(mustGet(cl, "/api/projects/"+pid+"/analytics", map[string]string{"days": "1"}))
		groups := asList(mustGet(cl, "/api/projects/"+pid+"/issues", map[string]string{"status": "open"}))
		high := 0
		for _, g := range groups {
			if str(asMap(g)["severity"]) == "high" {
				high++
			}
		}
		return map[string]any{"ingest": a["ingest"], "openIssues": len(groups), "highSeverity": high}, nil
	case "snag_file_issue":
		title, severity := sarg("title"), sarg("severity")
		if title == "" || (severity != "low" && severity != "medium" && severity != "high") {
			return nil, &apiError{msg: "title and a valid severity are required"}
		}
		body := map[string]any{"title": title, "severity": severity}
		for _, k := range []string{"session_id", "detector", "note"} {
			if v := sarg(k); v != "" {
				key := k
				if k == "session_id" {
					key = "sessionId"
				}
				body[key] = v
			}
		}
		return cl.request("/api/projects/"+pid+"/issues", "POST", body, nil)
	}
	return nil, &apiError{msg: "unknown tool " + name}
}

func mcpHandle(msg map[string]any) (any, bool) {
	switch msg["method"] {
	case "initialize":
		return map[string]any{"protocolVersion": mcpProtocol, "capabilities": map[string]any{"tools": map[string]any{}},
			"serverInfo": map[string]any{"name": "snag", "version": version}}, true
	case "tools/list":
		return map[string]any{"tools": mcpTools()}, true
	case "tools/call":
		params := asMap(msg["params"])
		result, err := mcpCall(str(params["name"]), asMap(params["arguments"]))
		if err != nil {
			return map[string]any{"content": []any{map[string]any{"type": "text", "text": "error: " + err.Error()}}, "isError": true}, true
		}
		return map[string]any{"content": []any{map[string]any{"type": "text", "text": jsonText(result, "  ")}}}, true
	case "ping":
		return map[string]any{}, true
	}
	return nil, false
}

func mcpServe() int {
	scanner := bufio.NewScanner(os.Stdin)
	scanner.Buffer(make([]byte, 0, 64*1024), 16*1024*1024)
	writer := bufio.NewWriter(os.Stdout)
	for scanner.Scan() {
		line := scanner.Bytes()
		if len(line) == 0 {
			continue
		}
		var msg map[string]any
		if json.Unmarshal(line, &msg) != nil {
			continue
		}
		result, ok := mcpHandle(msg)
		if _, hasID := msg["id"]; !hasID {
			continue
		}
		resp := map[string]any{"jsonrpc": "2.0", "id": msg["id"]}
		if ok {
			resp["result"] = result
		} else {
			resp["error"] = map[string]any{"code": -32601, "message": "method not found"}
		}
		b, _ := json.Marshal(resp)
		writer.Write(b)
		writer.WriteByte('\n')
		writer.Flush()
	}
	return 0
}
