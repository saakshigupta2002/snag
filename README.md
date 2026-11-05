<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/logo-dark.png">
    <img src="docs/assets/logo-light.png" width="180" alt="snag">
  </picture>
</p>

<p align="center"><b>See the bugs your users hit but never report.</b><br>
Self-hosted session replay that finds the problems for you, then hands them to your coding agent.</p>

<p align="center">
  <a href="https://github.com/saakshigupta2002/snag/actions/workflows/ci.yml"><img src="https://github.com/saakshigupta2002/snag/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-18181b" alt="MIT license"></a>
  <img src="https://img.shields.io/badge/self--hosted-your%20data%20stays%20yours-1a7f4b" alt="Self-hosted: your data stays yours">
  <img src="https://img.shields.io/badge/node-%E2%89%A520-18181b" alt="Node 20 or newer">
</p>

<p align="center">
  <img src="docs/assets/hero.png" width="860" alt="A real Snag issue from the bundled demo shop: POST /api/orders failed with a 500, 14 times across 7 sessions. The replay is paused on the click on Place order, beside the steps to reproduce and a timeline of what happened.">
</p>

A customer clicks **Place order**. The request returns a 500, nothing happens on screen and they leave. They do not file a bug report. Your logs show a number. They cannot show you what the person was trying to do.

Session replay can show you, but someone still has to watch hours of recordings to find the problem and those recordings usually live on a vendor's servers.

**Snag watches for you.**

- **It finds the problem.** Plain rules catch rage clicks, dead buttons, crashes, failed requests and abandoned forms. No AI and no model bill.
- **It shows you the cause.** Every issue opens the replay at the flagged second, with the failed request or stack trace beside the click.
- **It stays yours.** It runs on your own server. Passwords, card numbers and tokens are masked in the browser before anything is sent.
- **Your agent can finish the job.** [snag-cli](https://github.com/saakshigupta2002/snag-cli) gives a recording to Claude Code as text, so it can find the code, write the fix and prove it with a test. It stops for your go-ahead first.

## Try it in two minutes

You need Node 20 or newer. There is no database, account or key to set up.

```bash
git clone https://github.com/saakshigupta2002/snag && cd snag
npm ci && npm run build:libs

npm run dev:ingest      # terminal 1: the API, running in memory
npm run dev:dashboard   # terminal 2: the dashboard on http://localhost:3000
npm run demo            # terminal 3: a demo shop that is broken on purpose
```

Create a project at [localhost:3000](http://localhost:3000) and copy its key. Open `http://localhost:5173/?key=<your key>`, click around like a confused customer and close the tab. Your issues appear in the dashboard within seconds.

## See it in action

<p align="center">
  <a href="docs/assets/snag-walkthrough.mp4"><img src="docs/assets/snag-walkthrough.gif" width="860" alt="Walkthrough of the real dashboard: open a failed request from the issue list, jump to the flagged moment in the replay, copy the bug report, confirm it as a real bug, then look at the analytics overview."></a>
</p>

<p align="center"><sub>23 seconds of the real dashboard on the bundled demo shop. <a href="docs/assets/snag-walkthrough.mp4">Open the 1080p video</a>.</sub></p>

## Add it to your app

Your ingest service serves the recorder, so there is nothing to install. It works on any website.

```html
<script src="https://your-ingest-host/snag.js"></script>
<script>
  Snag.init({ projectKey: "pk_live_xxx", endpoint: "https://your-ingest-host" });
</script>
```

Settings in the dashboard shows this snippet with your key filled in. The recorder is 63 KB gzipped and it records page structure rather than video, so a 7 second session from the demo shop is 17 KB.

To run the full stack with Postgres:

```bash
cp .env.example .env
docker compose up --build    # http://localhost:3000, password "snag" until you set your own
```

Every port stays on your machine until you choose otherwise. [docs/self-hosting.md](docs/self-hosting.md) covers going live on a VM, Railway, Render or Fly and [Vercel with Supabase](docs/deploy-vercel-supabase.md).

## How it works

<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="docs/assets/how-it-works-dark.png">
    <img src="docs/assets/how-it-works-light.png" width="900" alt="Diagram in five steps: a visitor hits a problem and a small script records it, private data is masked in the browser, rules on your server flag the moment, you watch the clip and confirm or dismiss it, then your coding agent can fix it. Snag points, you decide.">
  </picture>
</p>

## What it catches

Snag caught all five bugs planted in the demo shop, across 12 scripted visits and with no configuration.

| It noticed | What Snag showed | Severity |
|---|---|---|
| A request failed | `POST /api/orders failed (500)`, 14 times in 7 sessions | High |
| The page crashed | `TypeError: discount.apply is not a function`, with the stack trace | High |
| Someone hammered a button | `Rage click on "Checkout now"`, 6 times | Medium |
| A form was left unfinished | `Form abandoned: form#signup-form`, 4 times | Low |
| A button did nothing | `Dead click on "Add to cart"`, 4 times | Low |

You can tune every threshold for each project and add your own flags from simple dropdowns. Four noisier detectors stay off until you have tuned them for your traffic. See [the detector reference](docs/detectors.md) and [custom flags](docs/custom-flags.md).

## Fix bugs with your coding agent

An agent cannot watch a video but it can read a transcript. [snag-cli](https://github.com/saakshigupta2002/snag-cli) turns a recording into one, so Claude Code can follow what happened and find the code behind it.

<p align="center">
  <img src="docs/assets/demo-terminal.svg" width="860" alt="Animated terminal: snag issue list shows real issues worst first. snag session evidence turns a recording into a timestamped transcript where a click on Place order is followed by POST /api/orders returning 500.">
</p>

<sub>Real output from the demo shop, sped up, with some lines skipped.</sub>

```bash
pipx install "git+https://github.com/saakshigupta2002/snag-cli"
snag auth login
```

Add its skills to Claude Code, then ask *"what's broken this week?"* It separates real bugs from expected behaviour and reports back. Nothing changes until you say which ones to fix. It runs on your Claude Code plan with no API key.

## Everything else in the dashboard

<table>
  <tr>
    <td width="50%"><img src="docs/assets/screen-issues.png" alt="The issue list: real issues ranked by severity, with keyboard shortcuts to confirm or dismiss."></td>
    <td width="50%"><img src="docs/assets/screen-overview.png" alt="The analytics overview: sessions, rage click and dead click rates, devices, browsers and operating systems."></td>
  </tr>
  <tr>
    <td align="center"><sub>Triage from the keyboard</sub></td>
    <td align="center"><sub>Analytics where every number opens the sessions behind it</sub></td>
  </tr>
</table>

- **Sessions worth watching**, ranked by activity so idle visits stay out of your way
- **Click heatmaps** and **funnels** with replays of the people who dropped off
- **Copy bug report** for a ready-made GitHub issue with steps to reproduce
- **Webhook alerts** that work with Slack when a new issue crosses your severity level
- **A read-only demo link** for one project, with no login

## Built to be trusted

| What could go wrong | What Snag does |
|---|---|
| A password gets recorded | Password fields are always masked and every other input records as dots by default |
| A card number or token sits in page text | A safety net masks emails, Luhn-checked card numbers, JWTs and long tokens even when nothing is tagged |
| Secrets travel in network calls | `Authorization` and cookies are always dropped. Other values go through a key denylist and a shape check |
| The tool cries wolf | Every detector has positive and negative fixtures and new ones ship switched off |
| The recorder breaks your site | It fails quietly and stays out of your app's way |
| Data leaves your server | Nothing phones home. The optional AI layer uses your own key, only sees flagged moments and has a daily cap |

All of this runs in the browser, before anything is sent. Pattern matching is never perfect, which is why the layers stack and the default is to redact. See [docs/configuration.md](docs/configuration.md) and [SECURITY.md](SECURITY.md).

## Good to know

- **One login.** Each deployment has a single password. There are no teams or roles yet.
- **Script tag only.** The recorder is not on npm yet, so load it from your ingest service.
- **After the fact.** Detection runs when a session ends, so issues appear after the visitor leaves and not during their visit.
- **Heatmaps mix screen sizes.** Phone and desktop clicks share one view for now.
- **It does not fix bugs on its own.** Snag points and you decide. The agent loop is opt-in and waits for your approval.

## FAQ

**What does it cost?**
Snag is free and MIT licensed. You pay for wherever you host it. The smallest managed Postgres tiers are enough for a small app.

**Does it work with my framework?**
Yes. It is a script tag, so it works with React, Next.js, Vue, Svelte or plain HTML, including single-page navigation.

**How is it different from hosted session replay?**
You run it yourself, so your users' data stays with you. It also finds the problems for you and shows them as a ranked list of issues, instead of leaving you with a pile of recordings.

**Is the AI required?**
No. All detection is plain code. The AI layer is off by default and needs your own Anthropic or OpenAI key.

## Project layout

```
packages/sdk         the recorder: rrweb, masking, redaction and transport
packages/detectors   the detection engine and each detector
packages/ingest      the API and workers, on Fastify and Postgres
packages/dashboard   the web app, on Next.js
packages/shared      shared TypeScript types
examples/demo-app    the demo shop that is broken on purpose
```

## Contributing

Contributions are welcome, especially new detectors and framework guides. `npm run check` runs the types, tests and style checks. Start with [CONTRIBUTING.md](CONTRIBUTING.md) or a [good first issue](https://github.com/saakshigupta2002/snag/labels/good%20first%20issue).

## License

[MIT](LICENSE) © Saakshi Gupta
