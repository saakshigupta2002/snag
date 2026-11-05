// Command snag is an agent-native CLI for Snag: a mirror of the Python
// implementation with identical commands and JSON output. Standard library only.
package main

import (
	"fmt"
	"os"
	"sort"
	"strconv"
	"strings"
)

const version = "0.1.0"

// Global flags (populated by the parser, read across the program).
var (
	flagJSON     bool
	flagSelect   string
	flagEndpoint string
	flagToken    string
	flagProject  string
	flagNoColor  bool
)

var sevRank = map[string]int{"high": 2, "medium": 1, "low": 0}

// parsed holds one invocation's flags + positionals.
type parsed struct {
	pos    []string
	str    map[string]string
	bools  map[string]bool
	fields []string // repeated --field
}

var valued = map[string]bool{
	"--select": true, "--endpoint": true, "--token": true, "--project": true,
	"--status": true, "--severity": true, "--detector": true, "--max": true,
	"--days": true, "--url": true, "--missions": true, "--workers": true,
	"--note": true, "--method": true, "--field": true, "--device": true,
	"--browser": true, "--since": true, "--dir": true, "--title": true,
	"--session": true,
}

func parse(argv []string) parsed {
	p := parsed{str: map[string]string{}, bools: map[string]bool{}}
	i := 0
	for i < len(argv) {
		a := argv[i]
		switch {
		case a == "-q":
			p.bools["--quiet"] = true
		case a == "-n":
			p.bools["--dry-run"] = true
		case a == "-h":
			p.bools["--help"] = true
		case strings.HasPrefix(a, "--") && strings.Contains(a, "="):
			kv := strings.SplitN(a, "=", 2)
			p.str[kv[0]] = kv[1]
			if kv[0] == "--field" {
				p.fields = append(p.fields, kv[1])
			}
		case strings.HasPrefix(a, "--") && valued[a]:
			if i+1 < len(argv) {
				p.str[a] = argv[i+1]
				if a == "--field" {
					p.fields = append(p.fields, argv[i+1])
				}
				i++
			}
		case strings.HasPrefix(a, "--"):
			p.bools[a] = true
		default:
			p.pos = append(p.pos, a)
		}
		i++
	}
	flagJSON = p.bools["--json"]
	flagNoColor = p.bools["--no-color"]
	flagSelect = p.str["--select"]
	flagEndpoint = p.str["--endpoint"]
	flagToken = p.str["--token"]
	flagProject = p.str["--project"]
	return p
}

func (p parsed) fieldList() []string {
	if flagSelect == "" {
		return nil
	}
	parts := strings.Split(flagSelect, ",")
	for i := range parts {
		parts[i] = strings.TrimSpace(parts[i])
	}
	return parts
}

func atoi(s string, def int) int {
	if n, err := strconv.Atoi(s); err == nil {
		return n
	}
	return def
}

func asList(v any) []any {
	if l, ok := v.([]any); ok {
		return l
	}
	return nil
}

func asMap(v any) map[string]any {
	if m, ok := v.(map[string]any); ok {
		return m
	}
	return map[string]any{}
}

func main() {
	os.Exit(run(os.Args[1:]))
}

func run(argv []string) int {
	p := parse(argv) // parse the whole line so flags may appear anywhere
	if p.bools["--version"] {
		fmt.Println("snag " + version)
		return exitOK
	}
	if len(p.pos) == 0 || p.bools["--help"] || p.pos[0] == "help" {
		usage()
		return exitUsage
	}
	resource := p.pos[0]
	p.pos = p.pos[1:] // handlers see the verb as pos[0]
	verb := ""
	if len(p.pos) > 0 {
		verb = p.pos[0]
	}

	code, err := dispatch(resource, verb, p)
	if err != nil {
		if ae, ok := err.(*apiError); ok {
			errorln(ae.msg)
			switch {
			case ae.status == 404:
				return exitNotFound
			case ae.status == 2:
				return exitUsage
			default:
				return exitUpstream
			}
		}
		errorln(err.Error())
		return exitError
	}
	return code
}

// verbs lists what each resource accepts, so a typo fails instead of running a default.
var verbs = map[string][]string{
	"auth":      {"login", "status"},
	"project":   {"list", "view"},
	"issue":     {"list", "view", "resolve", "create"},
	"session":   {"list", "view", "evidence"},
	"analytics": {"show", "funnels", "report"},
	"explore":   {"run", "scaffold"},
}

func dispatch(resource, verb string, p parsed) (int, error) {
	if known, ok := verbs[resource]; ok {
		if verb == "" {
			usage()
			return exitUsage, nil
		}
		if !contains(known, verb) {
			errorln(fmt.Sprintf("unknown command %q for %q", verb, resource))
			return exitUsage, nil
		}
	}
	switch resource {
	case "auth":
		if verb == "login" {
			return authLogin(), nil
		}
		return authStatus()
	case "project":
		if verb == "view" {
			return projectView(p)
		}
		return projectList(p)
	case "issue":
		switch verb {
		case "view":
			return issueView(p)
		case "resolve":
			return issueResolve(p)
		case "create":
			return issueCreate(p)
		default:
			return issueList(p)
		}
	case "session":
		switch verb {
		case "view":
			return sessionView(p)
		case "evidence":
			return sessionEvidence(p)
		default:
			return sessionList(p)
		}
	case "analytics":
		switch verb {
		case "funnels":
			return analyticsFunnels(p)
		case "report":
			return analyticsReport(p)
		default:
			return analyticsShow(p)
		}
	case "explore":
		return exploreDispatch(verb, p)
	case "api":
		return apiCmd(p)
	case "status":
		return statusCmd(p)
	case "mcp":
		return mcpServe(), nil
	case "version":
		fmt.Println("snag " + version)
		return exitOK, nil
	}
	errorln("unknown command: " + resource)
	usage()
	return exitUsage, nil
}

// ── project ─────────────────────────────────────────────────────────────────

func clientProject(needProject bool) (*Client, string, error) {
	cl, err := newClient(resolveConfig())
	if err != nil {
		return nil, "", err
	}
	if !needProject {
		return cl, "", nil
	}
	pid, err := cl.project()
	return cl, pid, err
}

func projectList(p parsed) (int, error) {
	cl, _, err := clientProject(false)
	if err != nil {
		return 0, err
	}
	got, err := cl.get("/api/projects", nil)
	if err != nil {
		return 0, err
	}
	if flagJSON {
		emitJSON(got, p.fieldList())
		return exitOK, nil
	}
	rows := [][]string{}
	for _, o := range asList(got) {
		m := asMap(o)
		rows = append(rows, []string{str(m["name"]), str(m["id"])})
	}
	table([]string{"name", "id"}, rows)
	return exitOK, nil
}

func projectView(p parsed) (int, error) {
	cl, pid, err := clientProject(false)
	if err != nil {
		return 0, err
	}
	if len(p.pos) > 1 {
		pid = p.pos[1]
	} else {
		if pid, err = cl.project(); err != nil {
			return 0, err
		}
	}
	got, err := cl.get("/api/projects/"+pid, nil)
	if err != nil {
		return 0, err
	}
	if flagJSON {
		emitJSON(got, p.fieldList())
		return exitOK, nil
	}
	m := asMap(got)
	kv([][2]string{{"name", str(m["name"])}, {"id", str(m["id"])}, {"key", str(m["projectKey"])}})
	return exitOK, nil
}

// ── issue ───────────────────────────────────────────────────────────────────

func issueList(p parsed) (int, error) {
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	got, err := cl.get("/api/projects/"+pid+"/issues", map[string]string{
		"status": p.str["--status"], "severity": p.str["--severity"], "detector": p.str["--detector"]})
	if err != nil {
		return 0, err
	}
	groups := asList(got)
	sort.SliceStable(groups, func(a, b int) bool {
		ma, mb := asMap(groups[a]), asMap(groups[b])
		ra, rb := sevRank[str(ma["severity"])], sevRank[str(mb["severity"])]
		if ra != rb {
			return ra > rb
		}
		return str(ma["lastSeen"]) > str(mb["lastSeen"])
	})
	if m := atoi(p.str["--max"], 0); m > 0 && m < len(groups) {
		groups = groups[:m]
	}
	if flagJSON {
		emitJSON(groups, p.fieldList())
		return exitOK, nil
	}
	if len(groups) == 0 {
		fmt.Println(dim("Nothing flagged for this filter."))
		return exitOK, nil
	}
	rows := [][]string{}
	for _, g := range groups {
		m := asMap(g)
		rows = append(rows, []string{str(m["severity"]), str(m["detector"]),
			str(m["occurrences"]), str(m["status"]), trunc(str(m["title"]), 60)})
	}
	table([]string{"severity", "detector", "count", "status", "issue"}, rows)
	return exitOK, nil
}

func issueView(p parsed) (int, error) {
	if len(p.pos) < 2 {
		return 0, &apiError{msg: "usage: snag issue view <groupKey>", status: 2}
	}
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	got, err := cl.get("/api/projects/"+pid+"/issues/"+urlEscape(p.pos[1]), nil)
	if err != nil {
		return 0, err
	}
	if flagJSON {
		emitJSON(got, p.fieldList())
		return exitOK, nil
	}
	m := asMap(got)
	rows := [][2]string{}
	for _, k := range []string{"title", "detector", "severity", "status", "occurrences", "firstSeen", "lastSeen"} {
		if m[k] != nil {
			rows = append(rows, [2]string{k, str(m[k])})
		}
	}
	kv(rows)
	if s := str(m["aiSummary"]); s != "" {
		fmt.Println("\n" + s)
	}
	return exitOK, nil
}

func issueCreate(p parsed) (int, error) {
	title, severity := p.str["--title"], p.str["--severity"]
	if title == "" || (severity != "low" && severity != "medium" && severity != "high") {
		return 0, &apiError{msg: "--title and --severity {low|medium|high} are required", status: 2}
	}
	if p.bools["--dry-run"] {
		fmt.Println(dim("would file AI issue [" + severity + "] " + title))
		return exitOK, nil
	}
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	body := map[string]any{"title": title, "severity": severity}
	if v := p.str["--session"]; v != "" {
		body["sessionId"] = v
	}
	if v := p.str["--detector"]; v != "" {
		body["detector"] = v
	}
	if v := p.str["--note"]; v != "" {
		body["note"] = v
	}
	res, err := cl.request("/api/projects/"+pid+"/issues", "POST", body, nil)
	if err != nil {
		return 0, err
	}
	if flagJSON {
		emitJSON(res, p.fieldList())
		return exitOK, nil
	}
	fmt.Println(green("filed") + " AI issue: " + str(asMap(res)["groupKey"]))
	return exitOK, nil
}

func issueResolve(p parsed) (int, error) {
	if len(p.pos) < 3 {
		return 0, &apiError{msg: "usage: snag issue resolve <groupKey> confirm|dismiss", status: 2}
	}
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	status := "confirmed"
	if p.pos[2] == "dismiss" {
		status = "dismissed"
	}
	if p.bools["--dry-run"] {
		fmt.Println(dim("would set " + p.pos[1] + " -> " + status))
		return exitOK, nil
	}
	_, err = cl.request("/api/projects/"+pid+"/issues/"+urlEscape(p.pos[1])+"/status", "POST",
		map[string]any{"status": status, "note": p.str["--note"]}, nil)
	if err != nil {
		return 0, err
	}
	fmt.Println(green("OK") + " " + p.pos[1] + " -> " + status)
	return exitOK, nil
}

// ── session ─────────────────────────────────────────────────────────────────

func sessionList(p parsed) (int, error) {
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	q := map[string]string{"device": p.str["--device"], "browser": p.str["--browser"],
		"detector": p.str["--detector"], "from": p.str["--since"]}
	if p.bools["--errors"] {
		q["errors"] = "1"
	}
	if p.bools["--bot"] {
		q["bot"] = "1"
	}
	got, err := cl.get("/api/projects/"+pid+"/sessions", q)
	if err != nil {
		return 0, err
	}
	sessions := asList(got)
	sort.SliceStable(sessions, func(a, b int) bool {
		ma, mb := asMap(sessions[a]), asMap(sessions[b])
		ia, _ := ma["interactions"].(float64)
		ib, _ := mb["interactions"].(float64)
		if ia != ib {
			return ia > ib
		}
		return str(ma["startedAt"]) > str(mb["startedAt"])
	})
	if m := atoi(p.str["--max"], 50); m > 0 && m < len(sessions) {
		sessions = sessions[:m]
	}
	if flagJSON {
		emitJSON(sessions, p.fieldList())
		return exitOK, nil
	}
	rows := [][]string{}
	for _, s := range sessions {
		m := asMap(s)
		started := str(m["startedAt"])
		if len(started) > 19 {
			started = started[:19]
		}
		rows = append(rows, []string{started, str(m["interactions"]), str(m["device"]),
			str(m["browser"]), str(m["status"]), str(m["id"])})
	}
	table([]string{"started", "activity", "device", "browser", "status", "id"}, rows)
	return exitOK, nil
}

func loadSession(cl *Client, sid string) (map[string]any, []any, error) {
	got, err := cl.get("/api/sessions/"+urlEscape(sid)+"/events", nil)
	if err != nil {
		return nil, nil, err
	}
	m := asMap(got)
	return asMap(m["session"]), asList(m["events"]), nil
}

func sessionView(p parsed) (int, error) {
	if len(p.pos) < 2 {
		return 0, &apiError{msg: "usage: snag session view <id>", status: 2}
	}
	cl, _, err := clientProject(false)
	if err != nil {
		return 0, err
	}
	session, events, err := loadSession(cl, p.pos[1])
	if err != nil {
		return 0, err
	}
	info := evidenceSummary(session, transcript(events))
	if flagJSON {
		emitJSON(info, p.fieldList())
		return exitOK, nil
	}
	rows := [][2]string{}
	for _, k := range []string{"id", "url", "device", "browser", "interactions", "activeMs", "durationMs", "problems", "steps"} {
		rows = append(rows, [2]string{k, str(info[k])})
	}
	kv(rows)
	return exitOK, nil
}

func sessionEvidence(p parsed) (int, error) {
	if len(p.pos) < 2 {
		return 0, &apiError{msg: "usage: snag session evidence <id>", status: 2}
	}
	cl, _, err := clientProject(false)
	if err != nil {
		return 0, err
	}
	session, events, err := loadSession(cl, p.pos[1])
	if err != nil {
		return 0, err
	}
	rows := transcript(events)
	info := evidenceSummary(session, rows)
	if flagJSON {
		emitJSON(map[string]any{"session": info, "transcript": rows}, p.fieldList())
		return exitOK, nil
	}
	fmt.Println(boldc("session "+str(info["id"])) + dim(fmt.Sprintf("  %s · %s interactions · %s problem(s)",
		str(info["browser"]), str(info["interactions"]), str(info["problems"]))))
	if u := str(info["url"]); u != "" {
		fmt.Println(dim(scrub(u)))
	}
	fmt.Println()
	for _, r := range rows {
		text := scrub(r.Text)
		if r.Bad {
			text = red(text)
		}
		fmt.Printf("%s  %s\n", dim(r.T), text)
	}
	if len(rows) == 0 {
		fmt.Println(dim("No interaction events in this recording (idle / bounce)."))
	}
	return exitOK, nil
}

// ── analytics / api / status ────────────────────────────────────────────────

func analyticsShow(p parsed) (int, error) {
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	got, err := cl.get("/api/projects/"+pid+"/analytics", map[string]string{"days": strDefault(p.str["--days"], "14")})
	if err != nil {
		return 0, err
	}
	if flagJSON {
		emitJSON(got, p.fieldList())
		return exitOK, nil
	}
	a := asMap(got)
	k := asMap(a["kpis"])
	u := asMap(a["users"])
	je := asMap(a["jsErrors"])
	bo := asMap(a["bots"])
	kv([][2]string{
		{"sessions", str(k["sessions"])}, {"pages/session", str(k["avgPagesPerSession"])},
		{"scroll depth", str(k["avgScrollPct"])}, {"unique users", str(u["unique"])},
		{"new / returning", str(u["new"]) + " / " + str(u["returning"])},
		{"js errors", str(je["pct"]) + "%"}, {"bots", str(bo["pct"]) + "%"},
	})
	return exitOK, nil
}

func analyticsFunnels(p parsed) (int, error) {
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	got, err := cl.get("/api/projects/"+pid+"/funnels", map[string]string{"days": strDefault(p.str["--days"], "30")})
	if err != nil {
		return 0, err
	}
	if flagJSON {
		emitJSON(got, p.fieldList())
		return exitOK, nil
	}
	results := asList(asMap(got)["results"])
	if len(results) == 0 {
		fmt.Println(dim("No funnels defined."))
		return exitOK, nil
	}
	for _, f := range results {
		m := asMap(f)
		fmt.Printf("%s: entered %s\n", str(m["name"]), str(m["entered"]))
	}
	return exitOK, nil
}

func analyticsReport(p parsed) (int, error) {
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	days := strDefault(p.str["--days"], "7")
	a := asMap(mustGet(cl, "/api/projects/"+pid+"/analytics", map[string]string{"days": days}))
	groups := asList(mustGet(cl, "/api/projects/"+pid+"/issues", map[string]string{"status": "open"}))
	high := 0
	for _, g := range groups {
		if str(asMap(g)["severity"]) == "high" {
			high++
		}
	}
	k := asMap(a["kpis"])
	u := asMap(a["users"])
	je := asMap(a["jsErrors"])
	fmt.Printf("# Snag report: last %s days\n\n", days)
	fmt.Printf("- **%s** sessions, **%s** unique users\n", str(k["sessions"]), str(u["unique"]))
	fmt.Printf("- **%d** open issues (**%d** high severity)\n", len(groups), high)
	fmt.Printf("- **%s%%** of sessions hit a JS error\n", str(je["pct"]))
	if len(groups) > 0 {
		sort.SliceStable(groups, func(a, b int) bool {
			return sevRank[str(asMap(groups[a])["severity"])] > sevRank[str(asMap(groups[b])["severity"])]
		})
		fmt.Println("\n## Top open issues")
		for i, g := range groups {
			if i >= 8 {
				break
			}
			m := asMap(g)
			fmt.Printf("- `%s` %s (%s, %s×)\n", str(m["severity"]), str(m["title"]),
				str(m["detector"]), str(m["occurrences"]))
		}
	}
	return exitOK, nil
}

func apiCmd(p parsed) (int, error) {
	if len(p.pos) < 1 {
		return 0, &apiError{msg: "usage: snag api <path>", status: 2}
	}
	cl, _, err := clientProject(false)
	if err != nil {
		return 0, err
	}
	path := p.pos[0]
	if !strings.HasPrefix(path, "/") {
		path = "/" + path
	}
	var body any
	if len(p.fields) > 0 {
		bm := map[string]any{}
		for _, f := range p.fields {
			kv := strings.SplitN(f, "=", 2)
			if len(kv) == 2 {
				bm[kv[0]] = kv[1]
			}
		}
		body = bm
	}
	got, err := cl.request(path, strDefault(p.str["--method"], "GET"), body, nil)
	if err != nil {
		return 0, err
	}
	emitJSON(got, p.fieldList())
	return exitOK, nil
}

func statusCmd(p parsed) (int, error) {
	cl, pid, err := clientProject(true)
	if err != nil {
		return 0, err
	}
	a := asMap(mustGet(cl, "/api/projects/"+pid+"/analytics", map[string]string{"days": "1"}))
	ing := asMap(a["ingest"])
	groups := asList(mustGet(cl, "/api/projects/"+pid+"/issues", map[string]string{"status": "open"}))
	high := 0
	for _, g := range groups {
		if str(asMap(g)["severity"]) == "high" {
			high++
		}
	}
	if flagJSON {
		emitJSON(map[string]any{"lastSessionAt": ing["lastSessionAt"], "sessionsToday": ing["sessionsToday"],
			"openIssues": len(groups), "highSeverity": high}, p.fieldList())
		return exitOK, nil
	}
	last := str(ing["lastSessionAt"])
	if last == "" {
		last = dim("never")
	}
	hs := "0"
	if high > 0 {
		hs = red(fmt.Sprintf("%d", high))
	}
	kv([][2]string{{"last session", last}, {"sessions today", str(ing["sessionsToday"])},
		{"open issues", fmt.Sprintf("%d", len(groups))}, {"high severity", hs}})
	return exitOK, nil
}

func mustGet(cl *Client, path string, q map[string]string) any {
	got, _ := cl.get(path, q)
	return got
}

func strDefault(s, def string) string {
	if s == "" {
		return def
	}
	return s
}

func contains(list []string, item string) bool {
	for _, v := range list {
		if v == item {
			return true
		}
	}
	return false
}

func usage() {
	fmt.Println(`snag: agent-native CLI for Snag

Usage: snag <resource> <verb> [args] [flags]

  auth      login | status
  project   list | view [<id>]
  issue     list | view <groupKey> | resolve <groupKey> confirm|dismiss | create
  session   list | view <id> | evidence <id>
  analytics show | funnels | report
  explore   run | scaffold
  api <path>   status   mcp   version

Flags: --json  --select a,b,c  --endpoint  --token  --project  --no-color
Examples:
  snag auth login
  snag issue list --json
  snag session evidence <id>`)
}
