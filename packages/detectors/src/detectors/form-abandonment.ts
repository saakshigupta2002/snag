import type { IssueCandidate } from '@snag/shared';
import { num, type Detector } from '../types.js';
import { makeGroupKey } from '../util.js';

interface FormState {
  fields: Set<string>;
  lastEngageTs: number;
  firstEngageTs: number;
  submitted: boolean;
}

/**
 * Form abandonment: the user engaged one or more fields of a form, then left
 * the page (navigation away or page hide) without ever submitting it.
 */
export const formAbandonment: Detector = {
  id: 'form_abandonment',
  tier: 1,
  defaultEnabled: true,
  defaultSeverity: 'low',
  defaultParams: { minFieldsInteracted: 1 },
  describe: 'A form was started but never submitted before leaving.',

  run(events, params) {
    const minFields = num(params, 'minFieldsInteracted', 1);
    const out: IssueCandidate[] = [];
    let forms = new Map<string, FormState>();

    const flush = (ts: number) => {
      for (const [selector, state] of forms) {
        if (state.submitted || state.fields.size < minFields) continue;
        out.push({
          detector: this.id,
          severity: this.defaultSeverity,
          tsStart: state.firstEngageTs,
          tsEnd: ts,
          groupKey: makeGroupKey(this.id, selector),
          title: `Form abandoned: ${selector}`,
          meta: { formSelector: selector, fieldsInteracted: state.fields.size },
          occurrences: 1,
        });
      }
      forms = new Map();
    };

    let currentPath: string | undefined;
    for (const e of events) {
      if (e.t === 'form') {
        if (e.action === 'engage') {
          const state =
            forms.get(e.formSelector) ??
            ({ fields: new Set(), lastEngageTs: e.ts, firstEngageTs: e.ts, submitted: false } satisfies FormState);
          state.fields.add(e.fieldSelector ?? 'field');
          state.lastEngageTs = e.ts;
          forms.set(e.formSelector, state);
        } else if (e.action === 'submit') {
          const state = forms.get(e.formSelector);
          if (state) state.submitted = true;
          else forms.set(e.formSelector, { fields: new Set(), lastEngageTs: e.ts, firstEngageTs: e.ts, submitted: true });
        }
      } else if (e.t === 'navigation') {
        if (currentPath !== undefined && e.path !== currentPath) flush(e.ts);
        currentPath = e.path;
      } else if (e.t === 'page_hide') {
        flush(e.ts);
      }
    }
    // Session over: anything still engaged and unsubmitted was abandoned.
    const lastTs = events.length ? events[events.length - 1]!.ts : 0;
    flush(lastTs);
    return out;
  },
};
