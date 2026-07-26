# snag

**An agent-native CLI for [Snag](https://github.com/saakshigupta2002/snag).** See, judge, fix
and verify the bugs your users actually hit — from the terminal, or from Claude Code.

[![CI](https://github.com/saakshigupta2002/snag-cli/actions/workflows/ci.yml/badge.svg)](https://github.com/saakshigupta2002/snag-cli/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

Snag records real sessions and flags the rough moments (rage clicks, dead buttons, silent errors,
failed requests) — but it deliberately stops there: *Snag points, the human decides.* This CLI
closes the loop. It hands those recordings to an agent that lives **in your repo**, so Claude Code
can read the evidence, find the code behind the bug, fix it, and prove the fix with a Playwright
test. It can also **hunt** for bugs before your users do.

No AI API key or per-token cost: the reasoning runs in **Claude Code on your subscription**. The
CLI is the deterministic data + safety layer; the [skills](#skills) are the agent workflows.

```text
snag explore   →  drive the app, record to Snag        (find bugs, even with no users)
snag issue     →  what got flagged, worst first
   judge       →  real bug or expected behavior?        (the gate — skip the noise)
snag session   →  read the recording as text
   fix         →  find the code, write the fix
   verify      →  a Playwright test proves it's gone
```

## Install

Two interchangeable implementations — **identical commands and JSON output.** Pick either.

```bash
# Python — zero third-party dependencies
pipx install "git+https://github.com/saakshigupta2002/snag-cli"     # gives `snag` and `snag-mcp`

# Go — a single static binary
go install github.com/saakshigupta2002/snag-cli/cmd/snag@latest
```

## Quickstart

```bash
snag auth login                 # your Snag URL + token (once)
snag issue list                 # what's broken, worst first
snag session evidence <id>      # a recording as a readable transcript
snag explore run --url http://localhost:3000   # actively hunt for bugs
```

Point it at any self-hosted Snag. For the agent loop, add the [skills](#skills) to Claude Code and
just ask: *"what's broken this week — and fix the real ones."*

## Commands

| Command | What it does |
|---|---|
| `snag auth login \| status` | connect to your Snag; show the current connection |
| `snag project list \| view [<id>]` | your projects |
| `snag issue list [--status --severity --detector]` | flagged issues, worst first |
| `snag issue view <groupKey>` | one issue + its evidence |
| `snag issue resolve <groupKey> confirm\|dismiss` | record your verdict |
| `snag session list [--errors --bot --device --browser]` | sessions, most active first |
| `snag session view <id>` | one session's summary |
| `snag session evidence <id>` | **the recording as agent-readable text** |
| `snag analytics show \| funnels \| report` | KPIs, funnels, a markdown digest |
| `snag explore run \| scaffold` | the active bug-hunter (Playwright) |
| `snag api <path>` | raw Snag API passthrough (escape hatch) |
| `snag status \| mcp \| version` | health · MCP server · version |

### Agent-friendly flags

```bash
snag --json issue list                              # structured output
snag --json --select groupKey,severity,title issue list   # only these fields (saves tokens)
snag --json session evidence <id> | jq '.transcript'      # pipe to jq
```

| Flag | Purpose |
|------|---------|
| `--json` | structured JSON for agents/scripts |
| `--select a,b,c` | keep only these fields |
| `--endpoint / --token / --project` | override config for one call |
| `--no-color`, `-q/--quiet`, `-n/--dry-run` | standard behaviours |

**Exit codes:** `0` ok · `2` usage · `3` not found · `4` network/upstream · `1` other.
**Config precedence:** flags → env (`SNAG_ENDPOINT`, `SNAG_TOKEN`, `SNAG_PROJECT`) → `~/.config/snag/config.json`.

## The evidence transcript

Claude can't watch a video, but it can read a transcript. `snag session evidence` turns a
recording into a compact, timestamped log an agent can reason about:

```text
session …:sess-1  Chrome · 4 interactions · 2 problem(s)
   0.0s  navigate /checkout (initial)
   0.9s  click Buy now
   1.5s  POST /api/pay -> 500 (140ms)
   1.7s  console.error TypeError: undefined is not a function
   2.4s  click Buy now
   4.0s  left the page
```

## Skills

Two Claude Code skills live in [`cli-skills/`](cli-skills/):

- **[`pp-snag`](cli-skills/pp-snag/SKILL.md)** — the loop: **triage** → **judge** (real bug vs
  expected behaviour — a wrong-password message is *not* a bug) → **session** (read the evidence)
  → **fix** (map the flag to the code) → **verify** (a semantic Playwright test, kept as a
  regression test).
- **[`pp-snag-explore`](cli-skills/pp-snag-explore/SKILL.md)** — write goal-directed missions,
  drive `snag explore`, and triage what breaks.

The judge step is what makes it trustworthy: Snag's rule-based detectors over-flag by design, and
Claude filters the false alarms before you spend any effort.

**You stay in control.** The skills report their findings and stop. They do not fix, commit or
push anything until you say which issues to act on. "Check what's broken" means report, not repair.

## The `explore` safety model

`snag explore` drives your app with the Playwright CLI while Snag records — and it's safe by
default, with no fake app to build:

- **Auto-mock:** calls to payment/email/SMS providers are answered with a fake `200`, so nothing
  real fires *and* Snag logs no false errors.
- **Non-prod guard:** it refuses a production-looking URL unless you pass `--force`.
- **Safe-by-default:** missions skip controls labelled delete / pay / send.

Run it against your existing dev server. `snag explore scaffold` writes the Playwright helpers into
your project if you want to inspect or extend them. Full details in the
[skill](cli-skills/pp-snag-explore/SKILL.md).

## MCP

The read operations are also available over MCP for agents that prefer it:

```json
{ "mcpServers": { "snag": { "command": "snag-mcp" } } }
```

Tools: `snag_list_issues`, `snag_get_issue`, `snag_list_sessions`, `snag_get_session_evidence`,
`snag_get_analytics`, `snag_get_status`.

## How it's built

| Piece | Job |
|-------|-----|
| `snag/api.py` | Snag ingest client (stdlib `urllib`, Bearer token) |
| `snag/evidence.py` | events → readable transcript |
| `snag/explore.py` | the Playwright bug-hunter + auto-mock + safety guards |
| `snag/db.py` | local SQLite mirror (`~/.local/share/snag/`) — a durable bug ledger |
| `snag/output.py` | human tables vs `--json` / `--select` |
| `snag/cli.py` | noun-verb command parsing and dispatch |
| `snag/mcp_server.py` | MCP server (stdio) exposing the read primitives |
| `cli-skills/` | the Claude Code skills that drive it |

A mirror-image **Go implementation** lives in [`cmd/snag/`](cmd/snag/) — same commands, same JSON,
same MCP — as a single static binary. Design follows [clig.dev](https://clig.dev) and the GitHub
CLI (`gh`): noun-verb grammar, human-first output with machine flags, a raw API escape hatch.

## Roadmap

Scheduled sweeps (`explore` on a cron), a shared local ledger of every bug ever found and fixed,
and richer `verify` reproduction for stateful flows. Precision — keeping the judge's false-positive
rate near zero — comes first.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). Keep the two implementations in lockstep
(same commands, same JSON) and the Python side dependency-free.

## License

[MIT](LICENSE).
