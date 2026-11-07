"""`snag setup`: connect Snag to the coding agents on this machine.

Installs the skills where each agent reads them and registers the MCP server,
so the agent can read recordings without any manual wiring.
"""

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

from . import output as out

SKILLS = ("snag", "snag-explore")
SOURCE = Path(__file__).parent / "skills"

# Where each agent reads personal skills and how it adds an MCP server.
AGENTS: List[Dict[str, Any]] = [
    {"id": "claude-code", "label": "Claude Code", "binary": "claude", "home": ".claude",
     "skills": ".claude/skills",
     "add": ["mcp", "add", "--scope", "user", "snag", "--", "snag", "mcp"]},
    {"id": "codex", "label": "Codex", "binary": "codex", "home": ".codex",
     "skills": ".agents/skills",
     "add": ["mcp", "add", "snag", "--", "snag", "mcp"]},
]
AGENT_IDS = [a["id"] for a in AGENTS]


def _present(agent: Dict[str, Any]) -> bool:
    return bool(shutil.which(agent["binary"])) or (Path.home() / agent["home"]).is_dir()


def _run(binary: str, args: Sequence[str]) -> int:
    done = subprocess.run([binary, *args], stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL,
                          stderr=subprocess.DEVNULL, timeout=30, check=False)
    return done.returncode


def _connect_mcp(agent: Dict[str, Any], dry_run: bool) -> str:
    binary = shutil.which(agent["binary"])
    if not binary:
        return "skipped"
    if _run(binary, ["mcp", "get", "snag"]) == 0:
        return "present"
    if dry_run:
        return "would add"
    return "added" if _run(binary, agent["add"]) == 0 else "failed"


def _install_skills(dest: Path) -> None:
    for name in SKILLS:
        shutil.copytree(SOURCE / name, dest / name, dirs_exist_ok=True)


def run(only: Optional[str], dry_run: bool, as_json: bool, fields: Optional[Sequence[str]]) -> int:
    chosen = [a for a in AGENTS if a["id"] == only or (not only and _present(a))]
    if not chosen:
        out.error("no coding agent found: looked for Claude Code and Codex")
        out.hint("Name one with --agent, or use the MCP server: snag mcp")
        return out.EXIT_NOT_FOUND
    results = []
    for agent in chosen:
        dest = Path.home() / agent["skills"]
        if not dry_run:
            _install_skills(dest)
        results.append({"agent": agent["id"], "skills": list(SKILLS), "skillsDir": str(dest),
                        "mcp": _connect_mcp(agent, dry_run)})
    if as_json:
        out.emit_json(results, fields)
        return out.EXIT_OK
    verb = "would connect" if dry_run else "connected"
    for agent, result in zip(chosen, results):
        print(f"{out.green(verb)} {agent['label']}: skills in {result['skillsDir']}, MCP {result['mcp']}")
    out.hint("Next: run `snag auth login`, then ask your agent \"what's broken this week?\"")
    return out.EXIT_OK
