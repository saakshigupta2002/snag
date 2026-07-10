# Deploying on Vercel + Supabase (no always-on server)

The reference design assumes a small always-on ingest service, but for personal / low-volume
use the whole stack runs on Vercel functions + Supabase Postgres. Two adaptations make it work,
both built in:

- **Detection runs inline on the final flush** (`PROCESS_ON_FINAL`, forced on by the serverless
  entry): when the SDK's tab-close beacon arrives, that session is sealed and scanned
  immediately — no interval worker needed.
- **A cron hits `GET /api/admin/tick`** for the leftovers: sessions that never sent a final
  flush (crashed tabs), retention pruning, and the AI pass.

## 1 · Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy a **pooled** connection string (Connect → Session pooler), e.g.
   `postgres://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres?sslmode=require`
3. Nothing to run by hand — Snag applies its schema on first boot.

## 2 · Vercel project A — ingest

Import the repo in Vercel and create a project with:

| Setting | Value |
|---|---|
| Root Directory | `packages/ingest` |
| Framework preset | Other (auto from `vercel.json`) |
| Build command | *(from `vercel.json`)* |

Environment variables:

```
DATABASE_URL   = <supabase pooled connection string>
SNAG_API_TOKEN = <openssl rand -hex 32>
CRON_SECRET    = <same value as SNAG_API_TOKEN>
# optional AI layer: AI_PROVIDER / AI_API_KEY / AI_MODEL / AI_DAILY_CAP
```

`CRON_SECRET` must equal `SNAG_API_TOKEN`: Vercel Cron sends it as the bearer token, and the
tick endpoint requires it. The bundled cron (`vercel.json`) runs daily at 03:00 UTC — on a Pro
plan you can tighten the schedule (e.g. `*/10 * * * *`) so crashed-tab sessions surface faster.

## 3 · Vercel project B — dashboard

Second project from the same repo:

| Setting | Value |
|---|---|
| Root Directory | `packages/dashboard` |
| Framework preset | Next.js |

Environment variables:

```
INGEST_URL         = https://<project-A>.vercel.app
SNAG_API_TOKEN     = <same as project A>
SNAG_SECRET        = <openssl rand -hex 32>
DASHBOARD_PASSWORD = <your login password>
```

## 4 · Wire up your app

Create a project in the dashboard, then:

```ts
Snag.init({
  projectKey: "pk_live_…",
  endpoint: "https://<project-A>.vercel.app",
});
```

## Caveats of the serverless shape

- Sessions from crashed tabs (no final beacon) wait for the next cron tick to be sealed —
  daily on Hobby, minutes on Pro.
- Function cold starts add ~a second to the first request; the pg pool is kept small
  (`PG_POOL_MAX=2` by default here) since every instance holds its own.
- High-traffic apps should still prefer the always-on shape
  ([docs/self-hosting.md](self-hosting.md)) — this path is for the low-volume, zero-ops case.
