import type { IssueCandidate, MechanicalCondition, MechanicalRule } from '@snag/shared';
import type { NormalizedEvent } from './normalize.js';
import { makeGroupKey, parseDuration, patternMatches, selectorMatches } from './util.js';

type Matcher = (e: NormalizedEvent) => boolean;

function compile(c: MechanicalCondition): Matcher {
  if ('urlIs' in c) {
    return (e) => e.t === 'navigation' && (e.path === c.urlIs || e.url === c.urlIs);
  }
  if ('urlMatches' in c) {
    return (e) => e.t === 'navigation' && patternMatches(e.url, c.urlMatches);
  }
  if ('clickOn' in c) {
    return (e) => e.t === 'click' && selectorMatches(e.selector, c.clickOn);
  }
  if ('consoleMatches' in c) {
    return (e) =>
      (e.t === 'console' || e.t === 'error') && patternMatches(e.message, c.consoleMatches);
  }
  if ('networkMatches' in c) {
    const { path, statusMin } = c.networkMatches;
    return (e) => {
      if (e.t !== 'network') return false;
      if (path && !patternMatches(e.path, path) && !patternMatches(e.url, path)) return false;
      if (statusMin !== undefined) {
        const failed = e.error !== undefined || e.timedOut || (e.status ?? 0) >= statusMin;
        if (!failed) return false;
      }
      return true;
    };
  }
  if ('formSubmitted' in c) {
    return (e) =>
      e.t === 'form' && e.action === 'submit' && selectorMatches(e.formSelector, c.formSubmitted);
  }
  return () => false;
}

/**
 * Evaluate a Kind A (mechanical) custom flag: every condition in `when.all`
 * must occur, all inside the `within` window (whole session when absent).
 * Deterministic, zero model calls — free by definition.
 */
export function runMechanicalRule(
  events: NormalizedEvent[],
  rule: MechanicalRule,
  detectorId: string,
): IssueCandidate[] {
  const conditions = rule.when?.all ?? [];
  if (!conditions.length) return [];
  const withinMs = rule.within !== undefined ? parseDuration(rule.within) : Number.POSITIVE_INFINITY;
  const matchers = conditions.map(compile);

  // Timestamps per condition, in stream order.
  const hits: number[][] = matchers.map((m) => events.filter(m).map((e) => e.ts));
  if (hits.some((h) => h.length === 0)) return [];

  const out: IssueCandidate[] = [];
  const anchors = hits[0]!;
  let resumeAfter = Number.NEGATIVE_INFINITY;

  for (const t0 of anchors) {
    if (t0 <= resumeAfter) continue;
    const windowEnd = withinMs === Number.POSITIVE_INFINITY ? Number.POSITIVE_INFINITY : t0 + withinMs;
    const matchedTs: number[] = [t0];
    let all = true;
    for (let i = 1; i < hits.length; i++) {
      const ts = hits[i]!.find((t) => t >= t0 && t <= windowEnd);
      if (ts === undefined) {
        all = false;
        break;
      }
      matchedTs.push(ts);
    }
    if (!all) continue;

    const tsStart = Math.min(...matchedTs);
    const tsEnd = Math.max(...matchedTs);
    out.push({
      detector: detectorId,
      severity: rule.severity ?? 'medium',
      tsStart,
      tsEnd,
      groupKey: makeGroupKey(detectorId, rule.name),
      title: rule.name,
      meta: { rule: rule.name, conditions: conditions.length },
      occurrences: 1,
    });
    if (withinMs === Number.POSITIVE_INFINITY) break; // session-wide: one hit max
    resumeAfter = windowEnd; // don't re-fire until the window fully elapses
  }
  return out;
}
