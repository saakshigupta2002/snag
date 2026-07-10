import type { IssueCandidate } from '@snag/shared';
import type { NormalizedEvent } from '../normalize.js';
import { bool, num, type Detector } from '../types.js';
import { makeGroupKey, truncate } from '../util.js';

type Click = Extract<NormalizedEvent, { t: 'click' }>;

/** Selector looks like something a user would expect to react to a click. */
const INTERACTIVE_RE =
  /(^|[\s>])(button|a|input|select|summary|label)([.#[:]|$)|\[role=|\.btn|button\.|button#|a\.|a#/i;

function looksInteractive(selector: string): boolean {
  const lastSegment = selector.split('>').pop() ?? selector;
  return INTERACTIVE_RE.test(lastSegment) || INTERACTIVE_RE.test(selector);
}

/**
 * Dead click: a click that produced no DOM mutation, navigation, network
 * request, or input change within the quiet window — a control that looks
 * live but isn't wired. Restricted to interactive-looking targets to keep
 * false positives low (clicking whitespace is normal behaviour).
 */
export const deadClick: Detector = {
  id: 'dead_click',
  tier: 1,
  defaultEnabled: true,
  defaultSeverity: 'low',
  defaultParams: { quietMs: 3000, interactiveOnly: true },
  describe: 'A click on a live-looking control produced no change at all.',

  run(events, params) {
    const quietMs = num(params, 'quietMs', 3000);
    const interactiveOnly = bool(params, 'interactiveOnly', true);
    const lastTs = events.length ? events[events.length - 1]!.ts : 0;
    const out: IssueCandidate[] = [];

    for (const e of events) {
      if (e.t !== 'click') continue;
      const click = e as Click;
      if (interactiveOnly && !looksInteractive(click.selector)) continue;
      // If the session ends inside the quiet window we can't know — skip.
      if (lastTs < click.ts + quietMs) continue;

      const reacted = events.some(
        (o) =>
          (o.t === 'mutation' || o.t === 'navigation' || o.t === 'network' || o.t === 'input') &&
          o.ts > click.ts &&
          o.ts <= click.ts + quietMs,
      );
      if (!reacted) {
        const label = click.text ? `“${truncate(click.text, 40)}”` : click.selector;
        out.push({
          detector: this.id,
          severity: this.defaultSeverity,
          tsStart: click.ts,
          tsEnd: click.ts + quietMs,
          groupKey: makeGroupKey(this.id, click.selector),
          title: `Dead click on ${label}`,
          meta: { selector: click.selector, text: click.text },
          occurrences: 1,
        });
      }
    }
    return out;
  },
};
