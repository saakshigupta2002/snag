---
name: snag-explore
description: "Actively hunt for bugs before real users hit them: drive the app with goal-directed Playwright missions while Snag records, then triage what breaks. Use when the user wants to test their app, find bugs proactively, do a pre-ship QA sweep or has no real traffic yet (cold start). Writes safe, goal-directed missions and runs them via `snag explore`, with payments/email auto-mocked and a non-production guard. Reports what it finds and hands off to snag; it does not fix on its own. Runs in Claude Code, no per-API cost."
author: "saakshigupta2002"
license: "MIT"
argument-hint: "run [--url <dev-url>] | scaffold"
allowed-tools: "Read Bash Write Glob Grep"
metadata:
  openclaw:
    requires:
      bins:
        - snag
    install:
      - kind: pipx
        bins: [snag, snag-mcp]
        package: "git+https://github.com/saakshigupta2002/snag-cli"
      - kind: go
        bins: [snag]
        module: github.com/saakshigupta2002/snag-cli/cmd/snag
---

# snag-explore

Find bugs proactively, even with zero real users, then report them so the user decides what to fix.

## Explore, then report. Do not fix on your own.

`explore` only tests. It never changes code. When the sweep finishes, **present the findings and
stop.** Fixing is a separate, opt-in step handled by `snag` and only after the user says which
issues to act on. See snag's "Ask before you change anything" rule. Finding a bug is not
permission to fix it.

## Prerequisites

```bash
pipx install "git+https://github.com/saakshigupta2002/snag-cli"
npm i -D @playwright/test && npx playwright install chromium    # in the app project
snag auth status                                                # Snag must be reachable
```

The app under test must (a) run on a **dev/staging** URL and (b) have the **Snag SDK** installed
so the exploration is recorded. Never point this at production.

## Safety, on by default, no setup

- **Auto-mock:** calls to payment/email/SMS providers are answered with a fake `200`, so nothing
  real fires and Snag logs no false errors. Extend the host list via `snag explore scaffold`.
- **Non-prod guard:** `snag explore run` refuses a production-looking URL unless `--force`.
- **Safe-by-default:** missions skip controls labeled delete / pay / send / cancel.
- Assume the worst click will happen and make it harmless. Rely on the environment, not the agent.

## One session per mission (keep the recordings watchable)

Each mission should be **one continuous session**: one browser context, opened once, that does the
whole flow and closes at the end. That produces a single clear recording per mission that a human
can watch start to finish. `snag explore run` already does this (one mission equals one Playwright
run equals one session), so **prefer it over hand-rolling scripts.** If you must drive a browser
yourself, do NOT open and close a fresh page per click; that shatters one flow into many
five-second clips that are noise in the dashboard. Give each mission a clear name so its session is
easy to find and keep missions few and purposeful rather than many and tiny.

## How to run a sweep

1. **Write goal-directed missions** (this is where you add value over random clicking). Read the
   app to learn its real flows, then write `missions.json`:
   ```json
   [
     { "name": "signup",   "goal": "complete the signup flow with valid data" },
     { "name": "checkout", "goal": "add an item and try to reach payment" },
     { "name": "pricing",  "goal": "click every CTA on the pricing page" }
   ]
   ```
   Each mission is one recorded session. Keep them focused; run the important flows.

2. **Run** (parallel workers, headless, safe-mode):
   ```bash
   snag explore run --url http://localhost:3000 --missions missions.json --workers 3
   snag explore run --url http://localhost:3000 --dry-run       # preview the plan first
   ```

3. **Triage what it caught, then report.** Hand off to `snag`:
   ```bash
   snag --json issue list
   ```
   Judge each (real bug vs expected; exploration produces lots of expected messages), then present
   the findings to the user and wait. The judge gate is essential here: expect noise, filter it
   hard. Fix only what the user approves.

## Notes

- `snag explore scaffold` writes the Playwright helpers (`safety-net.js`, config, `missions.json`)
  into your project so you can inspect or extend them.
- Headless-Chrome sessions are flagged as bots by Snag (the user-agent says "Headless"), so they
  sort under bot traffic and stay out of your real-user sessions.
- Treat a sweep as an on-demand action (before shipping a feature), not something to run in a tight
  loop; it consumes your Claude Code plan usage.
