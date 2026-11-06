package main

import (
	"fmt"
	"net/url"
	"strings"
)

const rrwebCustom = 5.0

type evRow struct {
	T    string `json:"t"`
	Kind string `json:"kind"`
	Bad  bool   `json:"bad"`
	Text string `json:"text"`
}

func pathOf(raw string) string {
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil {
		return raw
	}
	p := u.Path
	if p == "" {
		p = "/"
	}
	if u.RawQuery != "" {
		p += "?" + u.RawQuery
	}
	return p
}

func payload(ev map[string]any) map[string]any {
	if t, _ := ev["type"].(float64); t != rrwebCustom {
		return nil
	}
	data, _ := ev["data"].(map[string]any)
	if data == nil || data["tag"] != "snag" {
		return nil
	}
	p, _ := data["payload"].(map[string]any)
	return p
}

func line(offMs float64, p map[string]any) (evRow, bool) {
	t := fmt.Sprintf("%6.1fs", offMs/1000)
	kind, _ := p["kind"].(string)
	switch kind {
	case "navigation":
		trig, _ := p["trigger"].(string)
		s := "navigate " + pathOf(str(p["url"]))
		if trig != "" {
			s += " (" + trig + ")"
		}
		return evRow{t, "nav", false, s}, true
	case "click":
		label := str(p["text"])
		if label == "" {
			label = str(p["selector"])
		}
		rage, _ := p["rage"].(bool)
		s := "click " + label
		if rage {
			s += " [RAGE]"
		}
		return evRow{t, "click", rage, s}, true
	case "console":
		lvl := str(p["level"])
		return evRow{t, "console", lvl == "error",
			trunc("console."+lvl+" "+str(p["message"]), 200)}, true
	case "error":
		return evRow{t, "error", true, trunc("uncaught "+str(p["message"]), 200)}, true
	case "network":
		status := p["status"]
		bad := false
		if f, ok := status.(float64); ok && f >= 400 {
			bad = true
		}
		if p["error"] != nil || p["timedOut"] == true {
			bad = true
		}
		outcome := str(status)
		if outcome == "" {
			outcome = str(p["error"])
		}
		s := fmt.Sprintf("%s %s -> %s", str(p["method"]), pathOf(str(p["url"])), outcome)
		if p["durationMs"] != nil {
			s += fmt.Sprintf(" (%sms)", str(p["durationMs"]))
		}
		return evRow{t, "network", bad, s}, true
	case "form":
		return evRow{t, "form", p["action"] == "invalid",
			strings.TrimSpace("form " + str(p["action"]) + " " + str(p["formSelector"]))}, true
	case "event":
		return evRow{t, "event", false, "event \"" + str(p["name"]) + "\""}, true
	case "page_hide":
		return evRow{t, "end", false, "left the page"}, true
	}
	return evRow{}, false
}

func transcript(events []any) []evRow {
	rows := []evRow{}
	if len(events) == 0 {
		return rows
	}
	var start float64
	if m, ok := events[0].(map[string]any); ok {
		start, _ = m["timestamp"].(float64)
	}
	for _, e := range events {
		ev, _ := e.(map[string]any)
		p := payload(ev)
		if p == nil {
			continue
		}
		ts, _ := ev["timestamp"].(float64)
		if r, ok := line(ts-start, p); ok {
			rows = append(rows, r)
		}
	}
	return rows
}

func evidenceSummary(session map[string]any, rows []evRow) map[string]any {
	problems := 0
	for _, r := range rows {
		if r.Bad {
			problems++
		}
	}
	return map[string]any{
		"id": session["id"], "url": session["urlFirst"], "device": session["device"],
		"browser": session["browser"], "interactions": session["interactions"],
		"activeMs": session["activeMs"], "durationMs": session["durationMs"],
		"problems": problems, "steps": len(rows),
	}
}

func trunc(s string, n int) string {
	if len(s) > n {
		return s[:n]
	}
	return s
}
