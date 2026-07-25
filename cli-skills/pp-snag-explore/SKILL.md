---
name: pp-snag-explore
description: "Actively hunt for bugs before real users hit them: drive the app with goal-directed Playwright missions while Snag records, then triage what breaks. Use when the user wants to test their app, find bugs proactively, do a pre-ship QA sweep, or has no real traffic yet (cold start). Writes safe, goal-directed missions and runs them via `snag explore`, with payments/email auto-mocked and a non-production guard. Pairs with pp-snag to judge and fix what it finds. Runs in Claude Code — no per-API cost."
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

# pp-snag-explore

Find bugs proactively — even with zero real users — then hand them to `pp-snag` to fix.

## Prerequisites

```bash
pipx install "git+https://github.com/saakshigupta2002/snag-cli"
npm i -D @playwright/test && npx playwright install chromium    # in the app project
snag auth status                                                # Snag must be reachable
```

The app under test must (a) run on a **dev/staging** URL and (b) have the **Snag SDK** installed
so the exploration is recorded. Never point this at production.

## Safety — on by default, no setup

- **Auto-mock:** calls to payment/email/SMS providers are answered with a fake `200`, so nothing
  real fires and Snag logs no false errors. Extend the host list via `snag explore scaffold`.
- **Non-prod guard:** `snag explore run` refuses a production-looking URL unless `--force`.
- **Safe-by-default:** missions skip controls labeled delete / pay / send / cancel.
- Assume the worst click will happen and make it harmless — rely on the environment, not the agent.

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

3. **Triage what it caught** — hand off to `pp-snag`:
   ```bash
   snag --json issue list
   ```
   Then **judge** (real bug vs expected — exploration produces lots of expected messages), and
   fix + verify the real ones. The judge gate is essential here: expect noise, filter it hard.

## Notes

- `snag explore scaffold` writes the Playwright helpers (`safety-net.js`, config, `missions.json`)
  into your project so you can inspect or extend them.
- Treat a sweep as an on-demand action (before shipping a feature), not something to run in a
  tight loop — it consumes your Claude Code plan usage.
