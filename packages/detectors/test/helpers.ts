import {
  RRWEB_SOURCE,
  RRWEB_TYPE,
  SNAG_CUSTOM_TAG,
  type RawEvent,
  type SnagPayload,
} from '@snag/shared';

/** Base timestamp for fixtures; offsets in tests are relative ms. */
export const T0 = 1_700_000_000_000;

export function snag(offsetMs: number, payload: SnagPayload): RawEvent {
  return {
    type: RRWEB_TYPE.Custom,
    data: { tag: SNAG_CUSTOM_TAG, payload },
    timestamp: T0 + offsetMs,
  };
}

export function click(
  offsetMs: number,
  selector = 'div#app > button#buy.btn',
  opts: { x?: number; y?: number; text?: string } = {},
): RawEvent {
  return snag(offsetMs, {
    kind: 'click',
    selector,
    text: opts.text ?? 'Buy now',
    x: opts.x ?? 100,
    y: opts.y ?? 100,
  });
}

export function mutation(offsetMs: number): RawEvent {
  return {
    type: RRWEB_TYPE.IncrementalSnapshot,
    data: { source: RRWEB_SOURCE.Mutation },
    timestamp: T0 + offsetMs,
  };
}

export function input(offsetMs: number): RawEvent {
  return {
    type: RRWEB_TYPE.IncrementalSnapshot,
    data: { source: RRWEB_SOURCE.Input },
    timestamp: T0 + offsetMs,
  };
}

export function snapshot(offsetMs: number): RawEvent {
  return { type: RRWEB_TYPE.FullSnapshot, data: {}, timestamp: T0 + offsetMs };
}

export function consoleErr(offsetMs: number, message: string): RawEvent {
  return snag(offsetMs, { kind: 'console', level: 'error', message });
}

export function uncaught(offsetMs: number, message: string): RawEvent {
  return snag(offsetMs, { kind: 'error', message, source: 'uncaught' });
}

export function network(
  offsetMs: number,
  opts: {
    method?: string;
    url?: string;
    status?: number;
    error?: string;
    durationMs?: number;
    timedOut?: boolean;
  } = {},
): RawEvent {
  return snag(offsetMs, {
    kind: 'network',
    method: opts.method ?? 'GET',
    url: opts.url ?? '/api/data',
    status: opts.status,
    error: opts.error,
    durationMs: opts.durationMs ?? 80,
    timedOut: opts.timedOut,
  });
}

export function nav(
  offsetMs: number,
  url: string,
  trigger: 'initial' | 'push' | 'replace' | 'pop' = 'push',
): RawEvent {
  return snag(offsetMs, { kind: 'navigation', url, trigger });
}

export function formEngage(offsetMs: number, form = 'form#signup', field = 'input#email'): RawEvent {
  return snag(offsetMs, { kind: 'form', action: 'engage', formSelector: form, fieldSelector: field });
}

export function formSubmit(offsetMs: number, form = 'form#signup'): RawEvent {
  return snag(offsetMs, { kind: 'form', action: 'submit', formSelector: form });
}

export function formInvalid(offsetMs: number, form = 'form#signup'): RawEvent {
  return snag(offsetMs, { kind: 'form', action: 'invalid', formSelector: form });
}

export function pageHide(offsetMs: number): RawEvent {
  return snag(offsetMs, { kind: 'page_hide' });
}

/** A calm, healthy session — the negative fixture every detector must pass. */
export function normalSession(): RawEvent[] {
  return [
    snapshot(0),
    nav(10, 'https://app.test/', 'initial'),
    click(2000, 'nav > a#pricing', { text: 'Pricing' }),
    mutation(2100),
    nav(2150, 'https://app.test/pricing'),
    input(15000),
    network(16000, { method: 'GET', url: '/api/plans', status: 200 }),
    formEngage(20000, 'form#contact', 'input#name'),
    formEngage(24000, 'form#contact', 'input#message'),
    formSubmit(30000, 'form#contact'),
    network(30100, { method: 'POST', url: '/api/contact', status: 201 }),
    mutation(30200),
    pageHide(45000),
  ];
}
