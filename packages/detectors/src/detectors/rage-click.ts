import type { IssueCandidate } from '@snag/shared';
import type { NormalizedEvent } from '../normalize.js';
import { num, type Detector } from '../types.js';
import { makeGroupKey, truncate } from '../util.js';

type Click = Extract<NormalizedEvent, { t: 'click' }>;

function dist(a: Click, b: Click): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * Rage click: ≥N clicks within a short window inside a small radius on the
 * same element, with no resulting navigation or DOM change — pure frustration.
 */
export const rageClick: Detector = {
  id: 'rage_click',
  tier: 1,
  defaultEnabled: true,
  defaultSeverity: 'medium',
  defaultParams: { clicks: 4, windowMs: 1000, radiusPx: 30 },
  describe: 'Rapid repeated clicks in one spot with nothing happening.',

  run(events, params) {
    const minClicks = num(params, 'clicks', 4);
    const windowMs = num(params, 'windowMs', 1000);
    const radiusPx = num(params, 'radiusPx', 30);
    const tailMs = 500; // a change shortly after the burst still counts as a response

    const clicks = events.filter((e): e is Click => e.t === 'click');
    const out: IssueCandidate[] = [];

    let i = 0;
    while (i < clicks.length) {
      const first = clicks[i]!;
      const burst: Click[] = [first];
      let j = i + 1;
      while (j < clicks.length) {
        const c = clicks[j]!;
        if (c.ts - first.ts > windowMs) break;
        if (c.selector === first.selector && dist(c, first) <= radiusPx) burst.push(c);
        j++;
      }

      if (burst.length >= minClicks) {
        const last = burst[burst.length - 1]!;
        const reacted = events.some(
          (e) =>
            (e.t === 'mutation' || e.t === 'navigation') &&
            e.ts > first.ts &&
            e.ts <= last.ts + tailMs,
        );
        if (!reacted) {
          const label = first.text ? `“${truncate(first.text, 40)}”` : first.selector;
          out.push({
            detector: this.id,
            severity: this.defaultSeverity,
            tsStart: first.ts,
            tsEnd: last.ts,
            groupKey: makeGroupKey(this.id, first.selector),
            title: `Rage click on ${label}`,
            meta: {
              selector: first.selector,
              text: first.text,
              clicks: burst.length,
              x: first.x,
              y: first.y,
            },
            occurrences: 1,
          });
        }
        i = j; // consume the burst either way
      } else {
        i++;
      }
    }
    return out;
  },
};
