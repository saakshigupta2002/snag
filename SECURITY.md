# Security policy

Snag records how people use a website, so a privacy or security bug here can affect the people
visiting the apps that run it. Reports are very welcome.

## Reporting a vulnerability

Please report privately through
[GitHub's security advisories](https://github.com/saakshigupta2002/snag/security/advisories/new).
Do not open a public issue. Include the version or commit, the steps to reproduce and what an
attacker could do with it. You should get a first reply within a few days.

The most useful reports show that:

- masked or redacted data can be recovered from what the SDK sends
- a secret can leave the browser despite the redaction layers
- the dashboard or management API can be reached without the password or token
- a public demo link exposes anything beyond the one project it shares
- recorded page text that can steer a coding agent through the CLI or MCP server
- a way past the production guard or the payment and email mocks in `snag explore`

## Supported versions

Snag is pre-1.0, so fixes land on `main`. Run the latest commit.

## Hardening a deployment

- Set `SNAG_API_TOKEN`, `SNAG_SECRET` and `DASHBOARD_PASSWORD` to long random values. Ingest logs a
  warning when `SNAG_API_TOKEN` is missing, because the management API is open without it.
- Serve the dashboard and ingest over TLS.
- Keep `docker compose` bound to `127.0.0.1` unless a reverse proxy is in front of it.
- The `pk_live_` project key is public by design: it identifies a project and cannot read data.

## Known advisories

Two dependency advisories remain on Next.js 15 and only clear on Next.js 16. The PostCSS one
concerns CSS processed at build time. Snag builds only its own stylesheets.
