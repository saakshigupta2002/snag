# Contributing to Snag

Thanks for helping. The bar for the project is simple: a stranger should be able to understand,
trust, and run it in ten minutes.

## Setup

```bash
git clone https://github.com/saakshigupta2002/snag && cd snag
npm ci
npm run build:libs     # shared → detectors → sdk → ingest
npm test               # vitest across workspaces
npm run typecheck
```

Run the full local stack with `docker compose up --build`, or without Docker:

```bash
npm run dev:ingest       # in-memory store when DATABASE_URL is unset
npm run dev:dashboard    # INGEST_URL defaults to http://localhost:8787
npm run demo             # broken-on-purpose demo app on :5173
```

## Project shape

```
packages/shared      shared TS types (events, issues, rules)
packages/sdk         the recorder (rrweb wrapper, masking, redaction, transport)
packages/detectors   the detection engine + individual detector modules
packages/ingest      always-on ingestion API + workers (+ optional AI layer)
packages/dashboard   Next.js web UI
examples/demo-app    a demo app pre-wired with the SDK
docs/                self-hosting, configuration, detectors, custom flags
```

## Ground rules

- **Precision over coverage.** A detector that cries wolf gets muted. New detectors need
  positive *and* negative fixtures and ship `defaultEnabled: false` until they clear the bar.
- **Privacy is the default posture.** Anything that touches capture must mask/redact **in the
  browser, before transmission**. If in doubt, over-redact.
- **Zero cost by default.** Nothing may call a paid API unless the operator opted in with their
  own key. The mechanical path must work fully without one.
- **Small, isolated vendor adapters.** DB/host/model-provider code stays behind interfaces
  (`Store`, `AiProvider`) so self-hosters can swap pieces.
- No secrets in code — everything via env vars; `.env.example` stays blank; CI runs a secret
  scan.

## Pull requests

Branch from `main`, keep PRs focused, make sure `npm run typecheck && npm test` pass, and fill
in the PR template. For behavior changes, update the relevant doc in `docs/`.
