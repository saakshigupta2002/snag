import type { IssueCandidate } from '@snag/shared';
import { num, strings, type Detector } from '../types.js';
import { makeGroupKey, normalizeUrlPath, patternMatches } from '../util.js';

/**
 * Network failure: a request returned ≥4xx, errored before a response, or
 * timed out. 5xx / errors / timeouts are high severity; 4xx is medium.
 */
export const networkFailure: Detector = {
  id: 'network_failure',
  tier: 1,
  defaultEnabled: true,
  defaultSeverity: 'medium',
  defaultParams: { statusMin: 400, timeoutMs: 10000, ignoreUrls: [] },
  describe: 'A background request failed, errored, or timed out.',

  run(events, params) {
    const statusMin = num(params, 'statusMin', 400);
    const timeoutMs = num(params, 'timeoutMs', 10000);
    const ignoreUrls = strings(params, 'ignoreUrls');
    const out: IssueCandidate[] = [];

    for (const e of events) {
      if (e.t !== 'network') continue;
      if (ignoreUrls.some((p) => patternMatches(e.url, p))) continue;

      const timedOut = e.timedOut || e.durationMs >= timeoutMs;
      const failedStatus = typeof e.status === 'number' && e.status >= statusMin;
      const errored = !!e.error;
      if (!timedOut && !failedStatus && !errored) continue;

      const statusClass =
        typeof e.status === 'number' ? `${Math.floor(e.status / 100)}xx` : timedOut ? 'timeout' : 'error';
      const severity =
        typeof e.status === 'number' && e.status < 500 && !timedOut && !errored ? 'medium' : 'high';
      const path = normalizeUrlPath(e.url);
      const what =
        typeof e.status === 'number' ? `${e.status}` : timedOut ? 'timed out' : (e.error ?? 'failed');

      out.push({
        detector: this.id,
        severity,
        tsStart: e.ts,
        tsEnd: e.ts,
        groupKey: makeGroupKey(this.id, `${e.method} ${path} ${statusClass}`),
        title: `${e.method} ${path} failed (${what})`,
        meta: {
          method: e.method,
          url: e.url,
          status: e.status,
          error: e.error,
          durationMs: e.durationMs,
          timedOut,
        },
        occurrences: 1,
      });
    }
    return out;
  },
};
