import type { IngestPayload, RawEvent } from '@snag/shared';

export interface TransportOptions {
  endpoint: string;
  projectKey: string;
  sessionId: string;
  flushIntervalMs: number;
  maxBufferBytes: number;
}

function ingestUrl(endpoint: string): string {
  const base = endpoint.replace(/\/+$/, '');
  return base.endsWith('/ingest') ? base : `${base}/ingest`;
}

/**
 * Buffers events and flushes on an interval, on buffer-size pressure, and on
 * page hide (sendBeacon). Fails quietly: the SDK must never break or slow the
 * host app.
 */
export class Transport {
  private buf: RawEvent[] = [];
  private approxBytes = 0;
  private seq = 0;
  private timer: ReturnType<typeof setInterval> | undefined;
  private readonly url: string;
  private readonly referrer: string;

  constructor(private readonly opts: TransportOptions) {
    this.url = ingestUrl(opts.endpoint);
    this.referrer = typeof document !== 'undefined' ? document.referrer : '';
  }

  start(): void {
    this.timer = setInterval(() => this.flush(), this.opts.flushIntervalMs);
  }

  stop(): void {
    if (this.timer !== undefined) clearInterval(this.timer);
    this.flush(true);
  }

  push(event: RawEvent): void {
    this.buf.push(event);
    this.approxBytes += approxSize(event);
    if (this.approxBytes >= this.opts.maxBufferBytes) this.flush();
  }

  flush(final = false): void {
    if (!this.buf.length && !final) return;
    const events = this.buf;
    this.buf = [];
    this.approxBytes = 0;

    const payload: IngestPayload = {
      projectKey: this.opts.projectKey,
      sessionId: this.opts.sessionId,
      events,
      seqFrom: this.seq,
      seqTo: this.seq + Math.max(events.length - 1, 0),
      meta: {
        url: typeof location !== 'undefined' ? location.href : undefined,
        ts: Date.now(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
        // External referrer is only meaningful once, at session start.
        referrer: this.seq === 0 && this.referrer ? this.referrer : undefined,
        final: final || undefined,
      },
    };
    this.seq += events.length;
    const body = JSON.stringify(payload);

    try {
      // Prefer keepalive fetch even on the final flush: sendBeacon() sends a
      // JSON blob as a CORS-preflighted request, which it silently drops
      // cross-origin — so the last batch (page-hide events, Web Vitals) would
      // never arrive. keepalive fetch survives unload AND handles the preflight.
      void fetch(this.url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        keepalive: final,
      }).catch(() => {
        if (final && typeof navigator !== 'undefined' && 'sendBeacon' in navigator) {
          try {
            navigator.sendBeacon(this.url, new Blob([body], { type: 'application/json' }));
          } catch {
            // best effort
          }
        }
      });
    } catch {
      // Never let telemetry break the host app.
    }
  }
}

function approxSize(event: RawEvent): number {
  try {
    return JSON.stringify(event).length;
  } catch {
    return 512;
  }
}
