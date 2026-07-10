import {
  RRWEB_SOURCE,
  RRWEB_TYPE,
  isSnagEvent,
  type RawEvent,
} from '@snag/shared';
import { pathOf } from './util.js';

/**
 * Detectors never touch raw rrweb internals. The stream is first normalized
 * into flat, typed signals; rrweb structural events contribute only
 * "something changed" markers (mutation / input / scroll / snapshot).
 */
export type NormalizedEvent =
  | { t: 'click'; ts: number; selector: string; text?: string; x: number; y: number }
  | { t: 'mutation'; ts: number }
  | { t: 'input'; ts: number }
  | { t: 'scroll'; ts: number }
  | { t: 'snapshot'; ts: number }
  | { t: 'console'; ts: number; level: 'error' | 'warn'; message: string }
  | { t: 'error'; ts: number; message: string; stack?: string; source: string }
  | {
      t: 'network';
      ts: number;
      method: string;
      url: string;
      path: string;
      status?: number;
      error?: string;
      durationMs: number;
      timedOut: boolean;
    }
  | { t: 'navigation'; ts: number; url: string; path: string; trigger: string }
  | {
      t: 'form';
      ts: number;
      action: 'engage' | 'submit' | 'invalid';
      formSelector: string;
      fieldSelector?: string;
    }
  | { t: 'page_hide'; ts: number };

export function normalize(raw: RawEvent[]): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const e of raw) {
    const ts = e.timestamp;
    if (typeof ts !== 'number') continue;

    if (isSnagEvent(e)) {
      const p = e.data.payload;
      switch (p.kind) {
        case 'click':
          out.push({ t: 'click', ts, selector: p.selector, text: p.text, x: p.x, y: p.y });
          break;
        case 'console':
          out.push({ t: 'console', ts, level: p.level, message: p.message });
          break;
        case 'error':
          out.push({ t: 'error', ts, message: p.message, stack: p.stack, source: p.source });
          break;
        case 'network':
          out.push({
            t: 'network',
            ts,
            method: p.method.toUpperCase(),
            url: p.url,
            path: pathOf(p.url),
            status: p.status,
            error: p.error,
            durationMs: p.durationMs,
            timedOut: !!p.timedOut,
          });
          break;
        case 'navigation':
          out.push({ t: 'navigation', ts, url: p.url, path: pathOf(p.url), trigger: p.trigger });
          break;
        case 'form':
          out.push({
            t: 'form',
            ts,
            action: p.action,
            formSelector: p.formSelector,
            fieldSelector: p.fieldSelector,
          });
          break;
        case 'page_hide':
          out.push({ t: 'page_hide', ts });
          break;
      }
      continue;
    }

    if (e.type === RRWEB_TYPE.FullSnapshot) {
      out.push({ t: 'snapshot', ts });
      continue;
    }

    if (e.type === RRWEB_TYPE.IncrementalSnapshot) {
      const source = (e.data as { source?: number } | null)?.source;
      if (source === RRWEB_SOURCE.Mutation) out.push({ t: 'mutation', ts });
      else if (source === RRWEB_SOURCE.Input) out.push({ t: 'input', ts });
      else if (source === RRWEB_SOURCE.Scroll) out.push({ t: 'scroll', ts });
    }
  }
  out.sort((a, b) => a.ts - b.ts);
  return out;
}
