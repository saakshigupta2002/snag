# Configuration

## Environment variables

Every secret ships blank in `.env.example`. Generate tokens with `openssl rand -hex 32`.

| Variable | Used by | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | ingest | *(in-memory)* | Postgres connection string. Unset = volatile in-memory store (dev only). |
| `PORT` | ingest | `8787` | Ingest/API port. |
| `SNAG_API_TOKEN` | both | *(off)* | Bearer token the dashboard uses for the management API. Set it in production. |
| `INGEST_URL` | dashboard | `http://localhost:8787` | Where the dashboard server reaches ingest. |
| `SNAG_SECRET` | dashboard | dev value | Signs the login cookie. |
| `DASHBOARD_PASSWORD` | dashboard | *(auth off)* | Single-user login password (v1 auth model). |
| `RETENTION_DAYS` | ingest | `30` | Default session retention; per-project override in Settings. |
| `SESSION_IDLE_MS` | ingest | `1800000` | Idle time before a session is sealed for detection (30 min). |
| `WORKER_INTERVAL_MS` | ingest | `10000` | Detection worker tick. |
| `PROCESS_ON_FINAL` | ingest | `false`* | Run detection inline on a session's final flush. *Forced on by the serverless entry (Vercel). |
| `PG_POOL_MAX` | ingest | `10` | pg pool size. The serverless entry defaults it to `2`. |
| `AI_PROVIDER` | ingest | *(off)* | `anthropic` or `openai`. AI layer stays off without it. |
| `AI_API_KEY` | ingest | *(off)* | Your own key. You see and cap your own spend. |
| `AI_MODEL` | ingest | cheap default | Override the model (defaults: `claude-haiku-4-5` / `gpt-4o-mini`). |
| `AI_DAILY_CAP` | ingest | `50` | Hard ceiling on model calls per day, across all projects. |

## SDK options

```ts
import { Snag } from "@snag/sdk";

Snag.init({
  projectKey: "pk_live_xxx",        // from the dashboard
  endpoint: "https://ingest.myapp.com",

  maskAllInputs: true,              // default: every input records as dots
  block: [".billing-form"],         // not recorded at all (placeholder in replay)
  mask: [".pii"],                   // text obfuscated, layout kept
  unmask: [".search-box"],          // deliberate loosening (safety net still applies)

  captureNetwork: true,             // default; redaction always applied
  captureBodies: "redacted",        // or "off" (strict mode)
  redactExtraKeys: ["internal_id"], // extra key names to redact everywhere
  ignoreUrls: ["/analytics/"],      // skip capture for these requests

  respectDoNotTrack: true,          // default: DNT browsers are never recorded
  flushIntervalMs: 5000,
  maxBatchKb: 64,
});
```

### Masking model (defaults are aggressive on purpose)

| Layer | Default | Behaviour |
|---|---|---|
| Password inputs | always masked | Records that input occurred, never the characters. Non-negotiable. |
| `maskAllInputs` | on | Every text input records as dots; unmask selectively via `unmask`. |
| `.snag-block` | class hook | Element not recorded at all — placeholder box in replay. |
| `.snag-mask` | class hook | Text obfuscated, layout preserved. |
| Pattern safety net | always on | Emails, card numbers (Luhn-checked), JWTs, and long tokens are masked even when untagged — including inside `unmask`ed fields. |

### Network redaction (two layers, because either can miss)

Kept: method, path, status, duration. Redacted **before transmission**: `Authorization`
headers and cookies always; query/body values by key denylist (`password`, `token`, `secret`,
`card`, …) **and** by value shape (JWT-like, card-like, long-random-token-like). Honest
limitation: pattern matching is not infallible — a bizarrely shaped secret could slip past,
which is exactly why the layers stack and the default is redact. Add app-specific names via
`redactExtraKeys`.
