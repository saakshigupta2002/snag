# Snag

**Catch the moments your app trips users up.**

Snag is a self-hosted, privacy-first session watcher and issue detector for modern web apps. It
records how real people use your app, automatically flags the moments that look wrong — rage
clicks, dead buttons, silent errors, failed requests — and lets you confirm each one by watching
a short replay clip. Rule-based, zero model cost by default, and your users' data never leaves
your infrastructure.

[![CI](https://github.com/saakshigupta2002/snag/actions/workflows/ci.yml/badge.svg)](https://github.com/saakshigupta2002/snag/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Why it exists

A wave of apps is shipped fast by non-QA-engineers and breaks in predictable ways: dead buttons,
broken flows, silent errors, confusing states. The people shipping them don't need a 300-line
jargon report — they need to *see* where their app trips users up, in plain terms.

## How it works

```
 Recorder SDK ──► Ingestion API ──► Postgres ──► Detection Engine ──► Dashboard
 (in your app)    (always-on)                    (free, rule-based)   (you judge the clip)
```

1. **Records** real sessions as lightweight structural data — the DOM, not video — using
   [rrweb](https://github.com/rrweb-io/rrweb). A whole session is a few hundred KB of JSON.
2. **Detects** rough moments with plain, free, deterministic detectors. No AI required.
3. **Surfaces** each flagged moment as an issue with a replay clip that starts a few seconds
   before it happened, next to the console error or failed request that caused it.
4. **Defers judgment to you**: watch the clip, hit **Confirm** or **Dismiss**. Snag points; the
   human decides.
5. **Optionally** adds AI judgment for fuzzy cases — off by default, powered by your own API key.

### What makes it different

| | |
|---|---|
| **Self-hosted & private** | Session data never leaves your infrastructure. Nothing phones home. |
| **Frustration → cause** | The rage click is shown *next to* the console error or 500 that caused it. |
| **Zero cost to run** | The whole core is rule-based code. No model calls unless you opt in with your own key. |
| **Founder language** | "Dead click on 'Place order' — 12 occurrences — medium", not a pentest report. |
| **Tunable & extensible** | Toggle detectors, tune thresholds, define your own flags per project. |

## Quick start

```bash
git clone https://github.com/saakshigupta2002/snag && cd snag
cp .env.example .env      # set SNAG_API_TOKEN, SNAG_SECRET, DASHBOARD_PASSWORD
docker compose up --build
```

Open **http://localhost:3000**, sign in, create a project, and drop the SDK into your app:

```ts
import { Snag } from "@snag/sdk";

Snag.init({
  projectKey: "pk_live_xxx",            // from the dashboard
  endpoint: "https://ingest.myapp.com", // your ingest service
  maskAllInputs: true,                  // default
  captureNetwork: true,                 // default; redaction always applied
});
```

Use your app, then watch the issues roll into the dashboard. Sessions seal ~30 minutes after
going idle, or immediately on tab close.

### Try it without touching your app

The repo ships a demo shop where every button is broken on purpose:

```bash
npm ci && npm run build:libs
npm run dev:ingest        # terminal 1 — in-memory mode, no DB needed
npm run dev:dashboard     # terminal 2 → create a project, copy the key
npm run demo              # terminal 3 → http://localhost:5173/?key=pk_live_…
```

## What it catches out of the box

**Tier 1 (on by default):** rage clicks · dead clicks · console errors & uncaught exceptions ·
failed / timed-out network requests · form abandonment · backward-navigation U-turns.

**Tier 2 (off until tuned for your traffic):** navigation thrash · refresh spam · rapid bounce ·
repeated form errors.

Every threshold is tunable per project, and you can build custom flags from dropdown primitives
(free, deterministic) or as clearly-labeled AI judgment flags (your key, capped daily). See
[docs/detectors.md](docs/detectors.md) and [docs/custom-flags.md](docs/custom-flags.md).

## Privacy is the default posture

Masking and redaction happen **in the browser, before anything is sent** — sensitive data is
never recorded, so it physically cannot leak from the dashboard:

- Passwords: always masked. All inputs: masked by default (dots), loosened deliberately.
- `.snag-block` removes an element from recording entirely; `.snag-mask` obfuscates text.
- Pattern safety net: emails, card numbers (Luhn-checked), JWTs, and long tokens are masked
  even when untagged.
- Network capture keeps the debugging signal (method, path, status, duration) and drops the
  secret: `Authorization`/cookies always redacted, plus a key denylist **and** a value-shape
  net for bodies and query strings.
- Do-Not-Track is honoured. Retention is a per-project setting with automatic pruning.

Details in [docs/configuration.md](docs/configuration.md).

## The optional AI layer (bring your own key)

Off by default. The free mechanical layer filters first; the model only ever glances at the
tiny already-flagged, deduped slice — never raw traffic — with a hard daily cap and sampling.
Supports Anthropic and OpenAI keys. No key, no calls, no cost; everything else keeps working.

## Repository layout

```
packages/sdk         the recorder (rrweb wrapper, masking, redaction, transport)
packages/shared      shared TypeScript types (events, issues, rules)
packages/detectors   the detection engine + individual detector modules
packages/ingest      always-on ingestion API + workers (Fastify + Postgres)
packages/dashboard   the web UI (Next.js)
examples/demo-app    a demo app pre-wired with the SDK
docs/                self-hosting, configuration, detectors, custom flags
```

## Self-hosting for real

Dashboard on Vercel (or anywhere), ingest on any always-on Node host (Railway / Render / Fly /
a VM), Postgres wherever you like (Supabase, Neon, RDS, the compose db). The public repo is the
machine with empty slots; your deployment fills them via environment variables — see
[docs/self-hosting.md](docs/self-hosting.md).

## Explicit non-goals (v1)

- It does **not fix bugs** — it locates and evidences them; you fix them.
- It is **not an autonomous bug-hunting agent** — it's a passive watcher of real traffic.
- It is **not a security scanner**.
- It is **not a hosted SaaS** — self-hosting is the product.

## Roadmap

Candidate future tracks, explicitly deferred: live in-stream detection, an active-hunter mode,
a hosted offering, teams/roles auth. Detector quality — keeping the false-positive rate near
zero — comes before all of it.

## Contributing

PRs welcome — see [CONTRIBUTING.md](CONTRIBUTING.md). New detectors need positive **and**
negative fixtures and ship off-by-default until they clear the precision bar.

## License

[MIT](LICENSE)
