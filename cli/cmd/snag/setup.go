package main

import (
	"context"
	"fmt"
	"io/fs"
	"os"
	"os/exec"
	"path/filepath"
	"time"

	snagcli "github.com/saakshigupta2002/snag/cli"
)

var skillNames = []string{"snag", "snag-explore"}

// agentSpec says where an agent reads personal skills and how it adds an MCP server.
type agentSpec struct {
	id, label, binary, home, skills string
	add                             []string
}

var agents = []agentSpec{
	{"claude-code", "Claude Code", "claude", ".claude", ".claude/skills",
		[]string{"mcp", "add", "--scope", "user", "snag", "--", "snag", "mcp"}},
	{"codex", "Codex", "codex", ".codex", ".agents/skills",
		[]string{"mcp", "add", "snag", "--", "snag", "mcp"}},
}

func present(a agentSpec, home string) bool {
	if _, err := exec.LookPath(a.binary); err == nil {
		return true
	}
	info, err := os.Stat(filepath.Join(home, a.home))
	return err == nil && info.IsDir()
}

func runQuiet(binary string, args []string) int {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := exec.CommandContext(ctx, binary, args...).Run(); err != nil {
		return 1
	}
	return 0
}

func connectMCP(a agentSpec, dryRun bool) string {
	binary, err := exec.LookPath(a.binary)
	if err != nil {
		return "skipped"
	}
	if runQuiet(binary, []string{"mcp", "get", "snag"}) == 0 {
		return "present"
	}
	if dryRun {
		return "would add"
	}
	if runQuiet(binary, a.add) == 0 {
		return "added"
	}
	return "failed"
}

func installSkills(dest string) error {
	root := "snag/skills"
	return fs.WalkDir(snagcli.Skills, root, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		target := filepath.Join(dest, rel)
		if d.IsDir() {
			return os.MkdirAll(target, 0o755)
		}
		body, err := snagcli.Skills.ReadFile(path)
		if err != nil {
			return err
		}
		return os.WriteFile(target, body, 0o644)
	})
}

func setupCmd(p parsed) (int, error) {
	only := p.str["--agent"]
	if only != "" && only != "claude-code" && only != "codex" {
		errorln("--agent must be claude-code or codex")
		return exitUsage, nil
	}
	home, err := os.UserHomeDir()
	if err != nil {
		return exitError, err
	}
	dryRun := p.bools["--dry-run"]
	var chosen []agentSpec
	for _, a := range agents {
		if a.id == only || (only == "" && present(a, home)) {
			chosen = append(chosen, a)
		}
	}
	if len(chosen) == 0 {
		errorln("no coding agent found: looked for Claude Code and Codex")
		hintln("Name one with --agent, or use the MCP server: snag mcp")
		return exitNotFound, nil
	}
	results := []any{}
	for _, a := range chosen {
		dest := filepath.Join(home, filepath.FromSlash(a.skills))
		if !dryRun {
			if err := installSkills(dest); err != nil {
				return exitError, err
			}
		}
		results = append(results, map[string]any{
			"agent": a.id, "skills": skillNames, "skillsDir": dest, "mcp": connectMCP(a, dryRun),
		})
	}
	if flagJSON {
		emitJSON(results, p.fieldList())
		return exitOK, nil
	}
	verb := "connected"
	if dryRun {
		verb = "would connect"
	}
	for i, a := range chosen {
		r := results[i].(map[string]any)
		fmt.Printf("%s %s: skills in %s, MCP %s\n", green(verb), a.label, r["skillsDir"], r["mcp"])
	}
	hintln("Next: run `snag auth login`, then ask your agent \"what's broken this week?\"")
	return exitOK, nil
}
