# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/) and the project adheres to
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Analytics overview with drill-down from any number to the sessions behind it.
- Click heatmaps, funnels with drop-off replays and a scored list of sessions worth watching.
- A public read-only demo link for one project, with no login.
- AI-flagged issues: agents can file findings with a clip, next to what the detectors found.
- Favorites and deletion for recordings.
- `PUBLIC_INGEST_URL`, so the install snippet shows the address browsers should use.
- A warning at startup when `SNAG_API_TOKEN` is not set.

### Changed
- The install instructions in Settings and the docs now use the script tag ingest serves.
  They named an npm package that was never published.
- `docker compose` binds every port to `127.0.0.1`, because its defaults are for local trials.

### Fixed
- The demo shop's failing API call now reaches a route the recorder can see, so failed requests
  show up in the demo.

### Security
- Upgraded Next.js to 15.5.29, Fastify to 5.12 and Vitest to 5 to close critical and high
  advisories.

## [0.1.0] - 2026-07-10

Initial release.

### Added
- **Recorder SDK** (`@snag/sdk`): rrweb wrapper with capture-time masking (passwords always,
  all inputs by default, block/mask/unmask hooks, pattern safety net), network capture with
  two-layer redaction (key denylist + value shapes), batched transport with sendBeacon final
  flush, Do-Not-Track support.
- **Detection engine** (`@snag/detectors`): Tier 1 detectors on by default (rage click, dead
  click, console error, network failure, form abandonment, backward navigation), Tier 2
  off-by-default (navigation thrash, refresh spam, rapid bounce, repeated form errors),
  per-session dedup/grouping, severity scoring, mechanical custom-rule evaluator.
- **Ingestion service** (`@snag/ingest`): always-on Fastify API with project-key validation,
  chunked session storage on Postgres (in-memory fallback for dev), session lifecycle
  (active → completed → processed), detection worker, retention pruning, management API.
- **Dashboard** (`@snag/dashboard`): Next.js app with single-user auth, project switcher,
  grouped issue list with filters, rrweb-player replay auto-seeked to the flagged moment with a
  technical-evidence side panel, confirm/dismiss workflow, detector toggles and threshold
  tuning, custom flag builder (mechanical + clearly-labeled AI kind).
- **Optional AI layer**: BYO-key (Anthropic or OpenAI), off by default, summaries only for
  already-flagged deduped issue groups, daily cap + sampling.
- Docker Compose stack, deploy Dockerfiles, docs, demo app, CI (typecheck, tests, build,
  secret scan).
