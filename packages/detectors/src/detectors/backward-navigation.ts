import type { IssueCandidate } from '@snag/shared';
import type { NormalizedEvent } from '../normalize.js';
import { num, type Detector } from '../types.js';
import { makeGroupKey, normalizeUrlPath } from '../util.js';

type Nav = Extract<NormalizedEvent, { t: 'navigation' }>;

/**
 * Backward navigation (U-turn): the user went forward to a page and bounced
 * straight back to where they came from — usually confusion, a dead end, or
 * the wrong link label.
 */
export const backwardNavigation: Detector = {
  id: 'backward_navigation',
  tier: 1,
  defaultEnabled: true,
  defaultSeverity: 'low',
  defaultParams: { windowMs: 10000 },
  describe: 'Went to a page and immediately came straight back.',

  run(events, params) {
    const windowMs = num(params, 'windowMs', 10000);
    const navs = events.filter((e): e is Nav => e.t === 'navigation');
    const out: IssueCandidate[] = [];

    for (let i = 1; i < navs.length - 1; i++) {
      const from = navs[i - 1]!;
      const to = navs[i]!;
      const back = navs[i + 1]!;
      if (to.path === from.path) continue; // not a forward move
      if (back.path !== from.path) continue; // didn't return to origin
      if (back.ts - to.ts > windowMs) continue;

      const page = normalizeUrlPath(to.url);
      out.push({
        detector: this.id,
        severity: this.defaultSeverity,
        tsStart: to.ts,
        tsEnd: back.ts,
        groupKey: makeGroupKey(this.id, page),
        title: `Quick U-turn on ${page}`,
        meta: { page: to.path, returnedTo: from.path, dwellMs: back.ts - to.ts },
        occurrences: 1,
      });
    }
    return out;
  },
};
