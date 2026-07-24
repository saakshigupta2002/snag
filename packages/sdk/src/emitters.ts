import type { SnagPayload } from '@snag/shared';
import { buildSelector } from './selector.js';
import { scrubText } from './redact.js';

type Emit = (payload: SnagPayload) => void;

const TEXT_MAX = 60;
const MSG_MAX = 500;

function targetText(el: Element): string | undefined {
  if (el.closest('.snag-block,.snag-mask')) return undefined;
  const text = (el.textContent ?? '').trim().replace(/\s+/g, ' ');
  if (!text) return undefined;
  return scrubText(text.slice(0, TEXT_MAX));
}

function stringifyArg(a: unknown): string {
  if (typeof a === 'string') return a;
  if (a instanceof Error) return `${a.name}: ${a.message}`;
  try {
    return JSON.stringify(a);
  } catch {
    return String(a);
  }
}

/**
 * Snag's own lightweight signals: clicks, console errors, uncaught
 * exceptions, SPA navigations, form engagement, page hide. All strings are
 * pattern-scrubbed before they leave the handler. Returns a cleanup function.
 */
export function installEmitters(emit: Emit): () => void {
  const cleanups: Array<() => void> = [];

  // ── Clicks ──────────────────────────────────────────────────────────────
  const onClick = (e: MouseEvent) => {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    emit({
      kind: 'click',
      selector: buildSelector(target),
      text: targetText(target),
      x: Math.round(e.clientX),
      y: Math.round(e.clientY),
    });
  };
  document.addEventListener('click', onClick, true);
  cleanups.push(() => document.removeEventListener('click', onClick, true));

  // ── Console errors ──────────────────────────────────────────────────────
  const origError = console.error;
  console.error = (...args: unknown[]) => {
    try {
      const message = scrubText(args.map(stringifyArg).join(' ').slice(0, MSG_MAX));
      emit({ kind: 'console', level: 'error', message });
    } catch {
      // never break console
    }
    origError.apply(console, args);
  };
  cleanups.push(() => {
    console.error = origError;
  });

  // ── Uncaught exceptions & unhandled rejections ──────────────────────────
  const onError = (e: ErrorEvent) => {
    emit({
      kind: 'error',
      message: scrubText(String(e.message ?? 'Unknown error').slice(0, MSG_MAX)),
      stack: e.error?.stack ? scrubText(String(e.error.stack).slice(0, 2000)) : undefined,
      source: 'uncaught',
    });
  };
  const onRejection = (e: PromiseRejectionEvent) => {
    const reason = e.reason as { message?: string; stack?: string } | string | undefined;
    const message = typeof reason === 'string' ? reason : (reason?.message ?? 'Unhandled rejection');
    emit({
      kind: 'error',
      message: scrubText(String(message).slice(0, MSG_MAX)),
      stack:
        typeof reason === 'object' && reason?.stack
          ? scrubText(String(reason.stack).slice(0, 2000))
          : undefined,
      source: 'unhandledrejection',
    });
  };
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);
  cleanups.push(() => {
    window.removeEventListener('error', onError);
    window.removeEventListener('unhandledrejection', onRejection);
  });

  // ── Navigation (SPA + back/forward) ─────────────────────────────────────
  let lastUrl = location.href;
  const emitNav = (trigger: 'initial' | 'push' | 'replace' | 'pop') => {
    emit({ kind: 'navigation', url: location.href, from: lastUrl, trigger });
    lastUrl = location.href;
  };
  emitNav('initial');

  const origPush = history.pushState.bind(history);
  const origReplace = history.replaceState.bind(history);
  history.pushState = (...args: Parameters<History['pushState']>) => {
    origPush(...args);
    emitNav('push');
  };
  history.replaceState = (...args: Parameters<History['replaceState']>) => {
    origReplace(...args);
    emitNav('replace');
  };
  const onPop = () => emitNav('pop');
  window.addEventListener('popstate', onPop);
  cleanups.push(() => {
    history.pushState = origPush;
    history.replaceState = origReplace;
    window.removeEventListener('popstate', onPop);
  });

  // ── Forms: engagement, submit, validation rejection ─────────────────────
  const fieldTag = /^(input|textarea|select)$/i;
  const onFocusIn = (e: FocusEvent) => {
    const field = e.target instanceof Element ? e.target : null;
    if (!field || !fieldTag.test(field.tagName)) return;
    const form = field.closest('form');
    if (!form) return;
    emit({
      kind: 'form',
      action: 'engage',
      formSelector: buildSelector(form),
      fieldSelector: buildSelector(field),
    });
  };
  const onSubmit = (e: Event) => {
    const form = e.target instanceof Element ? e.target.closest('form') : null;
    if (!form) return;
    emit({ kind: 'form', action: 'submit', formSelector: buildSelector(form) });
  };
  const onInvalid = (e: Event) => {
    const field = e.target instanceof Element ? e.target : null;
    const form = field?.closest('form');
    if (!form) return;
    emit({
      kind: 'form',
      action: 'invalid',
      formSelector: buildSelector(form),
      fieldSelector: field ? buildSelector(field) : undefined,
    });
  };
  document.addEventListener('focusin', onFocusIn, true);
  document.addEventListener('submit', onSubmit, true);
  document.addEventListener('invalid', onInvalid, true);
  cleanups.push(() => {
    document.removeEventListener('focusin', onFocusIn, true);
    document.removeEventListener('submit', onSubmit, true);
    document.removeEventListener('invalid', onInvalid, true);
  });

  // ── Web Vitals (LCP / CLS / INP≈) ───────────────────────────────────────
  // Captured via PerformanceObserver and reported once, on the way out.
  let lcpMs: number | undefined;
  let cls = 0;
  let inpMs = 0;
  let vitalsSent = false;
  const observers: PerformanceObserver[] = [];
  const observe = (type: string, cb: (entries: PerformanceEntryList) => void) => {
    try {
      const po = new PerformanceObserver((list) => cb(list.getEntries()));
      po.observe({ type, buffered: true } as PerformanceObserverInit);
      observers.push(po);
    } catch {
      // entry type unsupported in this browser — skip
    }
  };
  observe('largest-contentful-paint', (entries) => {
    const last = entries[entries.length - 1];
    if (last) lcpMs = Math.round(last.startTime);
  });
  observe('layout-shift', (entries) => {
    for (const e of entries as (PerformanceEntry & { value: number; hadRecentInput: boolean })[]) {
      if (!e.hadRecentInput) cls += e.value;
    }
  });
  observe('event', (entries) => {
    for (const e of entries) if (e.duration > inpMs) inpMs = e.duration;
  });
  cleanups.push(() => {
    for (const o of observers) {
      try {
        o.disconnect();
      } catch {
        // best effort
      }
    }
  });
  const flushVitals = () => {
    if (vitalsSent) return;
    vitalsSent = true;
    if (lcpMs === undefined && cls === 0 && inpMs === 0) return;
    emit({
      kind: 'vitals',
      lcpMs,
      cls: cls > 0 ? Math.round(cls * 1000) / 1000 : undefined,
      inpMs: inpMs > 0 ? Math.round(inpMs) : undefined,
    });
  };

  // ── Page hide (also triggers the final flush in index.ts) ───────────────
  const onPageHide = () => {
    flushVitals();
    emit({ kind: 'page_hide' });
  };
  window.addEventListener('pagehide', onPageHide);
  cleanups.push(() => window.removeEventListener('pagehide', onPageHide));
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') flushVitals();
  };
  document.addEventListener('visibilitychange', onVisibility);
  cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));

  return () => {
    for (const fn of cleanups) {
      try {
        fn();
      } catch {
        // best effort
      }
    }
  };
}
