import type { IssueCandidate } from '@snag/shared';
import type { NormalizedEvent } from '../normalize.js';
import { num, type Detector } from '../types.js';
import { makeGroupKey, normalizeUrlPath } from '../util.js';

type Nav = Extract<NormalizedEvent, { t: 'navigation' }>;

/**
 * Tier 2 detectors ship off-by-default: per Principle 2 they stay opt-in
 * until tuned against real traffic. Toggle them per project in flag settings.
 */

/** Navigation thrash: bouncing between the same two pages repeatedly — lost. */
export const navigationThrash: Detector = {
  id: 'navigation_thrash',
  tier: 2,
  defaultEnabled: false,
  defaultSeverity: 'medium',
  defaultParams: { count: 3, windowMs: 30000 },
  describe: 'Bounced between the same two pages again and again.',

  run(events, params) {
    const minCount = num(params, 'count', 3);
    const windowMs = num(params, 'windowMs', 30000);
    const navs = events.filter((e): e is Nav => e.t === 'navigation');
    const out: IssueCandidate[] = [];

    for (let i = 0; i + 1 < navs.length; i++) {
      const a = navs[i]!.path;
      const b = navs[i + 1]!.path;
      if (a === b) continue;
      // Count alternations a→b→a→b… starting here, inside the window.
      let hops = 1;
      let j = i + 1;
      while (j + 1 < navs.length) {
        const expected = hops % 2 === 0 ? b : a;
        const next = navs[j + 1]!;
        if (next.path !== expected) break;
        if (next.ts - navs[i]!.ts > windowMs) break;
        hops++;
        j++;
      }
      if (hops >= minCount) {
        const pair = [normalizeUrlPath(a), normalizeUrlPath(b)].sort().join(' ↔ ');
        out.push({
          detector: this.id,
          severity: this.defaultSeverity,
          tsStart: navs[i]!.ts,
          tsEnd: navs[j]!.ts,
          groupKey: makeGroupKey(this.id, pair),
          title: `Navigation thrash between ${pair}`,
          meta: { pages: [a, b], hops: hops + 1 },
          occurrences: 1,
        });
        i = j; // consume the run
      }
    }
    return out;
  },
};

/** Refresh spam: multiple full reloads of one URL in a short window — stuck. */
export const refreshSpam: Detector = {
  id: 'refresh_spam',
  tier: 2,
  defaultEnabled: false,
  defaultSeverity: 'medium',
  defaultParams: { count: 3, windowMs: 30000 },
  describe: 'Reloaded the same page several times in a row.',

  run(events, params) {
    const minCount = num(params, 'count', 3);
    const windowMs = num(params, 'windowMs', 30000);
    const reloads = events.filter(
      (e): e is Nav => e.t === 'navigation' && e.trigger === 'initial',
    );
    const out: IssueCandidate[] = [];

    let i = 0;
    while (i < reloads.length) {
      const first = reloads[i]!;
      let j = i;
      let count = 0;
      while (j < reloads.length) {
        const r = reloads[j]!;
        if (r.ts - first.ts > windowMs) break;
        if (r.path === first.path) count++;
        j++;
      }
      if (count >= minCount) {
        const page = normalizeUrlPath(first.url);
        out.push({
          detector: this.id,
          severity: this.defaultSeverity,
          tsStart: first.ts,
          tsEnd: reloads[j - 1]!.ts,
          groupKey: makeGroupKey(this.id, page),
          title: `Refresh spam on ${page}`,
          meta: { page: first.path, reloads: count },
          occurrences: 1,
        });
        i = j;
      } else {
        i++;
      }
    }
    return out;
  },
};

/** Rapid bounce: landed and left within seconds without doing anything. */
export const rapidBounce: Detector = {
  id: 'rapid_bounce',
  tier: 2,
  defaultEnabled: false,
  defaultSeverity: 'low',
  defaultParams: { thresholdMs: 3000 },
  describe: 'Landed on the app and left within seconds, doing nothing.',

  run(events, params) {
    const thresholdMs = num(params, 'thresholdMs', 3000);
    if (!events.length) return [];
    const first = events[0]!;
    const last = events[events.length - 1]!;
    if (last.ts - first.ts > thresholdMs) return [];

    const meaningful = events.some(
      (e) => e.t === 'click' || e.t === 'input' || (e.t === 'form' && e.action !== 'invalid'),
    );
    if (meaningful) return [];

    const landing = events.find((e): e is Nav => e.t === 'navigation');
    const page = landing ? normalizeUrlPath(landing.url) : '/';
    return [
      {
        detector: this.id,
        severity: this.defaultSeverity,
        tsStart: first.ts,
        tsEnd: last.ts,
        groupKey: makeGroupKey(this.id, page),
        title: `Rapid bounce from ${page}`,
        meta: { page, durationMs: last.ts - first.ts },
        occurrences: 1,
      },
    ];
  },
};

/** Repeated form errors: the same form kept failing validation — a trap. */
export const repeatedFormErrors: Detector = {
  id: 'repeated_form_errors',
  tier: 2,
  defaultEnabled: false,
  defaultSeverity: 'medium',
  defaultParams: { count: 3 },
  describe: 'The same form was rejected multiple times.',

  run(events, params) {
    const minCount = num(params, 'count', 3);
    const byForm = new Map<string, { count: number; first: number; last: number }>();
    for (const e of events) {
      if (e.t !== 'form' || e.action !== 'invalid') continue;
      const s = byForm.get(e.formSelector) ?? { count: 0, first: e.ts, last: e.ts };
      s.count++;
      s.last = e.ts;
      byForm.set(e.formSelector, s);
    }
    const out: IssueCandidate[] = [];
    for (const [selector, s] of byForm) {
      if (s.count < minCount) continue;
      out.push({
        detector: this.id,
        severity: this.defaultSeverity,
        tsStart: s.first,
        tsEnd: s.last,
        groupKey: makeGroupKey(this.id, selector),
        title: `Form rejected ${s.count} times: ${selector}`,
        meta: { formSelector: selector, rejections: s.count },
        occurrences: 1,
      });
    }
    return out;
  },
};
