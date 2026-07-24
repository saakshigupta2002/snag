import type { IssueCandidate } from '@snag/shared';
import { strings, type Detector } from '../types.js';
import { makeGroupKey, normalizeMessage, patternMatches, truncate } from '../util.js';

/**
 * Console error: any console.error or uncaught exception. Uncaught exceptions
 * are high severity; console.error is medium. Warnings are ignored — too noisy.
 */
export const consoleError: Detector = {
  id: 'console_error',
  tier: 1,
  defaultEnabled: true,
  defaultSeverity: 'medium',
  defaultParams: { ignorePatterns: [] },
  describe: 'The app threw an error or logged one to the console.',

  run(events, params) {
    const ignore = strings(params, 'ignorePatterns');
    const out: IssueCandidate[] = [];

    for (const e of events) {
      let message: string;
      let uncaught = false;
      let stack: string | undefined;
      if (e.t === 'error') {
        message = e.message;
        stack = e.stack;
        uncaught = true;
      } else if (e.t === 'console' && e.level === 'error') {
        message = e.message;
      } else {
        continue;
      }
      if (ignore.some((p) => patternMatches(message, p))) continue;

      out.push({
        detector: this.id,
        severity: uncaught ? 'high' : 'medium',
        tsStart: e.ts,
        tsEnd: e.ts,
        groupKey: makeGroupKey(this.id, normalizeMessage(message)),
        title: uncaught
          ? `Uncaught exception: ${truncate(message, 90)}`
          : `Console error: ${truncate(message, 90)}`,
        // stack (uncaught only) lets the issue view show the trace inline, so a
        // dev can often fix without opening the replay at all.
        meta: stack ? { message, uncaught, stack } : { message, uncaught },
        occurrences: 1,
      });
    }
    return out;
  },
};
