# Custom flags

Three layers of control, revealed progressively: built-in defaults (zero effort) → toggle & tune
(a few clicks) → custom flags (deliberate). You never need any of this to get your first result.

## Two kinds, decided at creation

The creation UI splits the kinds **before you save**, so a flag's cost is never a surprise:

| | Kind A — Mechanical | Kind B — Smart (AI) |
|---|---|---|
| Built with | Dropdown rule builder | Separate, clearly-labeled AI-flag form |
| Checks | Facts code can measure | Judgment ("looks broken", "seems confusing") |
| Cost | Zero, always | Model call on **your own key** |
| Runtime path | Detection engine (deterministic) | AI worker (only on already-flagged clips, daily-capped) |

## Kind A — mechanical rule shape

The builder emits shapes composed entirely of primitives the engine evaluates deterministically
over the event stream — free by definition:

```json
{
  "name": "Pay clicked but payment API failed",
  "severity": "high",
  "when": {
    "all": [
      { "urlMatches": "/checkout" },
      { "clickOn": "#buy-button" },
      { "networkMatches": { "path": "/api/pay", "statusMin": 400 } }
    ]
  },
  "within": "10s"
}
```

All conditions must occur inside the `within` window (whole session if omitted).

### Condition primitives

| Primitive | Matches |
|---|---|
| `{ "urlIs": "/checkout" }` | Navigation to exactly this path/URL |
| `{ "urlMatches": "checkout" }` | Navigation URL contains / regex-matches |
| `{ "clickOn": "#buy" }` | A click whose selector path contains this text |
| `{ "consoleMatches": "payment" }` | Console error / exception message contains / regex-matches |
| `{ "networkMatches": { "path": "/api/pay", "statusMin": 400 } }` | Request to path; with `statusMin`, only failed ones |
| `{ "formSubmitted": "#signup" }` | A submit on a matching form |

Selector matching is deliberately loose: the recorded selector path
(`div#app > form.checkout > button#buy.btn`) matches a rule value like `#buy` or `.checkout`.

Scope note: primitives observe the **event stream**. Conditions that require inspecting DOM
state at a point in time (e.g. "element X is empty") aren't expressible yet — pair a mechanical
flag with a Kind B judgment flag for those.

## Kind B — AI judgment flags

```json
{ "name": "Checkout looks broken", "severity": "high",
  "prompt": "Does the checkout screen look broken or stuck to a human?" }
```

Kind B flags are stored and shown like any rule, but only ever evaluated by the AI worker:
off unless the project's AI layer is enabled **and** the operator's key is present, only on
already-flagged sessions, deduped, sampled, and hard-capped per day (`AI_DAILY_CAP`). No key,
no calls, no cost — everything else keeps working.
