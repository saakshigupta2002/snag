# Self-hosting Snag

Snag is one always-on Node service (ingest + workers), one web app (dashboard), and a Postgres
database. Session data never leaves your infrastructure.

## Option 1 — docker compose (fastest)

```bash
git clone https://github.com/saakshigupta2002/snag && cd snag
cp .env.example .env          # fill in SNAG_API_TOKEN, SNAG_SECRET, DASHBOARD_PASSWORD
docker compose up --build
```

- Dashboard → http://localhost:3000 (password = `DASHBOARD_PASSWORD`, default `snag`)
- Ingest → http://localhost:8787
- Postgres → localhost:5432 (`snag`/`snag`)

Create a project in the dashboard, copy the `pk_live_…` key, drop the SDK into your app.

## Option 2 — split deployment (recommended for production)

The dashboard is stateless and can live anywhere (Vercel works). The **ingest service must be an
always-on host** — session recording is a continuous stream of batches; serverless functions
don't hold it well. Railway, Render, Fly.io, or any VM with Node 20+ all work.

| Piece | Where | Needs |
|---|---|---|
| `@snag/ingest` | Railway / Render / Fly / VM | `DATABASE_URL`, `SNAG_API_TOKEN`, `PORT` |
| `@snag/dashboard` | Vercel / same host | `INGEST_URL`, `SNAG_API_TOKEN`, `SNAG_SECRET`, `DASHBOARD_PASSWORD` |
| Postgres | Supabase / Neon / RDS / anywhere | — |

Steps:

```bash
npm ci
npm run build:libs                      # shared + detectors + sdk + ingest
node packages/ingest/dist/server.js    # with env set — migrates the schema on boot

npm run build -w @snag/dashboard
npm run start -w @snag/dashboard       # or deploy packages/dashboard to Vercel
```

The schema is applied automatically on ingest boot (idempotent `CREATE TABLE IF NOT EXISTS`,
see [`packages/ingest/src/db/schema.sql`](../packages/ingest/src/db/schema.sql)).

## The two-version rule

The public repo is the machine with empty slots; your deployment is the same machine with your
slots filled in. **Real values live only in your deployment's environment** — never commit a
key, even temporarily. `.env` is gitignored and CI runs a secret scan on every PR.

## Sizing notes

- A session is typically a few hundred KB of structured JSON, not video. A busy day of a small
  app fits comfortably in the smallest managed Postgres tiers.
- Retention pruning (default 30 days, per-project setting) keeps growth bounded.
- Ingestion is rate-limited per project key and batches are size-capped.
