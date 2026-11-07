---
name: snag
description: "Triage, judge, fix and verify the bugs your users actually hit, using Snag session recordings, from inside the repo. Use when the user asks what's broken, wants to review flagged issues, understand a session recording, find the code behind a bug, fix a bug Snag caught or confirm a fix stopped the bug. Reads issues, sessions and an agent-readable evidence transcript via the `snag` CLI, judges real bugs vs expected behavior and only fixes with the user's go-ahead. No per-API cost: the reasoning runs in Claude Code."
author: "saakshigupta2002"
license: "MIT"
argument-hint: "<triage|judge|session <id>|fix <groupKey>|verify <groupKey>>"
allowed-tools: "Read Bash Edit Write Grep Glob"
metadata:
  openclaw:
    requires:
      bins:
        - snag
    install:
      - kind: pipx
        bins: [snag, snag-mcp]
        package: "git+https://github.com/saakshigupta2002/snag#subdirectory=cli"
      - kind: go
        bins: [snag]
        module: github.com/saakshigupta2002/snag/cli/cmd/snag
---

# snag

Close Snag's loop: it finds and evidences the bug, you (the coding agent, in the repo) fix it.

## Ask before you change anything (hard rule)

This skill has two phases. The first is read-only. The second changes code. **Never cross
from one to the other on your own.**

- **Read-only phase** (triage, judge, session): look at what Snag flagged and report it.
- **Change phase** (fix, verify, resolve): edit files, run tests, resolve issues.

**Stop after the read-only phase and show the user the findings. Do not fix, edit, commit or
push anything until the user says which issues to act on.** "Check what's broken" means report,
not repair. When the user has picked, fix those and nothing more. Ask again before you commit or
push. If the user explicitly said "fix them" or "just fix it" up front, you may proceed, but say
what you are about to change first.

## Prerequisites

```bash
pipx install "git+https://github.com/saakshigupta2002/snag-cli"   # or: go install .../cmd/snag@latest
snag auth status        # if not configured: snag auth login
```

Always pass `--json` for structured output and `--select` to keep only the fields you need.

## Read-only phase

### 1. triage: what's broken?

```bash
snag --json issue list                     # worst first
snag --json --select groupKey,severity,detector,occurrences,title issue list
```

Summarize for the user in plain language, grouped by likely root cause.

### 2. judge: real bug, or expected behavior? (the gate)

For each candidate, read its evidence and decide:

```bash
snag --json issue view <groupKey>
snag session evidence <sessionId>          # the recording as readable text
```

Classify each as:
- **real bug**: a control does nothing, a crash, a 5xx that should not happen, a broken flow.
- **expected**: a wrong-password message, a normal 404, a validation warning. Not a bug, skip it.
- **noise**: a third-party script error, a one-off. Skip.

### 3. session: understand it

`snag session evidence <id>` prints a timestamped transcript (clicks, navigations,
console/uncaught errors, network calls, form actions). Read it like a story: what did the user
do and where did it go wrong?

### Report and wait

Present the findings: for each real bug, a one-line summary, the evidence, the likely cause and a
suggested fix. Then **stop and ask the user which ones to fix.** Do not continue on your own.

### File the findings into Snag (durable, opt-in)

So a finding does not vanish when the chat ends, you can file each judged bug back into Snag as an
**AI-flagged issue**, linked to the session's clip. It lands in the Issues list next to the
auto-detected ones, tagged "AI", as a normal open issue the user triages (confirm or dismiss). This
records a finding; it never fixes code. Only file bugs that passed the judge gate and tell the
user you are doing it.

```bash
snag issue create --title "Place order does nothing" --severity high \
  --session <sessionId> --detector checkout --note "clicked 3x, no request fired"
```

## Change phase (only after the user approves)

### 4. fix: find the code, change it

Map the evidence to the repo:
- a flagged **selector / button text**: search the codebase for that label or handler.
- a failed **request path** (e.g. `POST /api/pay`): the route or handler that serves it.
- an **uncaught error message / stack**: the throwing file.

Use Grep/Glob to locate it, Read to confirm, Edit to fix. Show the change before applying it.

### 5. verify: prove it's gone

Prefer an **active** check for UI or deterministic bugs; fall back to **passive** for backend or
timing bugs.

- **Active (Playwright CLI):** turn the session's steps into a *semantic* Playwright test (use
  `getByRole`/`getByText`, not brittle rrweb selectors), run it against the app with the fix and
  assert the bad thing (console error / 5xx / dead click) no longer happens. Keep the test; it is
  a regression test grown from a real session.
  ```bash
  npx playwright test tests/<bug>.spec.ts     # red before the fix, green after
  ```
- **Passive:** if the bug depends on real data, backend or timing and cannot be reproduced, watch
  new sessions instead: `snag --json issue list` over the next while and confirm the group stops
  firing.

Be honest in wording: a passing repro means *this path* no longer errors, not "fixed forever."

### 6. resolve: record the verdict (with permission)

```bash
snag issue resolve <groupKey> confirm --note "fixed in <file>: <what>"
```

Ask before you commit or push the code change.

## Notes

- Bots and idle/low-signal sessions are down-ranked automatically; focus on active sessions.
- `snag api <path>` is a raw passthrough for anything the typed commands do not cover.
- An MCP server (`snag mcp`) exposes the same reads if you prefer MCP tools over the CLI.
