# Detector reference

Every value is a tunable parameter, not a constant (Settings → Detectors). Defaults are
conservative on purpose: a tool that cries wolf gets muted.

## Tier 1 — on by default

| Detector | Fires when (default) | Params (defaults) | Severity |
|---|---|---|---|
| `rage_click` | ≥4 clicks within 1000 ms inside a 30 px radius on the same element, with no resulting navigation or DOM change | `clicks 4, windowMs 1000, radiusPx 30` | medium |
| `dead_click` | A click on an interactive-looking control yields no DOM mutation, navigation, or network request within 3000 ms | `quietMs 3000, interactiveOnly true` | low |
| `console_error` | Any `console.error` (medium) or uncaught exception / unhandled rejection (high) | `ignorePatterns []` | med / high |
| `network_failure` | A request returns ≥400, errors, or times out | `statusMin 400, timeoutMs 10000, ignoreUrls []` | med (4xx) / high (5xx, error, timeout) |
| `form_abandonment` | ≥1 form field engaged, then the page is left with no submit | `minFieldsInteracted 1` | low |
| `backward_navigation` | Navigate forward to a page then straight back to the prior one within 10 s | `windowMs 10000` | low |

## Tier 2 — off by default until tuned against real traffic

| Detector | Fires when (default) | Params (defaults) | Severity |
|---|---|---|---|
| `navigation_thrash` | ≥3 hops between the same two URLs within 30 s | `count 3, windowMs 30000` | medium |
| `refresh_spam` | ≥3 full reloads of one URL within 30 s | `count 3, windowMs 30000` | medium |
| `rapid_bounce` | Landed and left within 3 s with no meaningful action | `thresholdMs 3000` | low |
| `repeated_form_errors` | The same form rejected (HTML5 `invalid`) ≥3 times | `count 3` | medium |

## Adding a detector

Drop a module into `packages/detectors/src/detectors/`, implement the `Detector` interface,
register it in `registry.ts`, give it default params — no core changes. The bar for shipping:

1. Fixture-based unit tests with positive **and negative** cases.
2. It must pass the shared `normalSession()` negative fixture.
3. It ships `defaultEnabled: false` until validated against real sessions — a detector earns
   default-on by rarely lying, not by being clever.

The one metric that matters most is the **false-positive rate**. Confidence — the entire point
of the tool — dies the first time it cries wolf.
