import {
  RRWEB_TYPE,
  SNAG_CUSTOM_TAG,
  type IngestPayload,
  type RawEvent,
  type SnagPayload,
} from '@snag/shared';

export const T0 = 1_700_000_000_000;

export function snag(offsetMs: number, payload: SnagPayload): RawEvent {
  return {
    type: RRWEB_TYPE.Custom,
    data: { tag: SNAG_CUSTOM_TAG, payload },
    timestamp: T0 + offsetMs,
  };
}

export function snapshot(offsetMs: number): RawEvent {
  return { type: RRWEB_TYPE.FullSnapshot, data: {}, timestamp: T0 + offsetMs };
}

/** A session containing one obvious problem: a 500 from the payment API. */
export function roughSessionEvents(): RawEvent[] {
  return [
    snapshot(0),
    snag(10, { kind: 'navigation', url: 'https://app.test/checkout', trigger: 'initial' }),
    snag(2000, {
      kind: 'network',
      method: 'POST',
      url: '/api/pay',
      status: 500,
      durationMs: 120,
    }),
    snag(2500, { kind: 'console', level: 'error', message: 'payment failed' }),
    snag(9000, { kind: 'page_hide' }),
  ];
}

export function payload(
  projectKey: string,
  sessionId: string,
  events: RawEvent[],
  opts: { seqFrom?: number; final?: boolean } = {},
): IngestPayload {
  const seqFrom = opts.seqFrom ?? 0;
  return {
    projectKey,
    sessionId,
    events,
    seqFrom,
    seqTo: seqFrom + Math.max(events.length - 1, 0),
    meta: {
      url: 'https://app.test/checkout',
      // Recent enough to survive retention pruning, old enough to count as
      // idle for the sealing tests (which use SESSION_IDLE_MS=1000).
      ts: Date.now() - 60_000,
      userAgent: 'test-agent',
      final: opts.final,
    },
  };
}
