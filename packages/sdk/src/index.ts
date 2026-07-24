import { record } from 'rrweb';
import type { RawEvent, SnagPayload } from '@snag/shared';
import { buildMaskingOptions } from './masking.js';
import { installEmitters } from './emitters.js';
import { installNetworkCapture } from './network.js';
import { Transport } from './transport.js';
import { getSessionId, getVisitorId } from './session.js';
import type { SnagHandle, SnagOptions } from './types.js';

export type { SnagOptions, SnagHandle } from './types.js';

let active: SnagHandle | null = null;

function doNotTrack(): boolean {
  const nav = navigator as Navigator & { msDoNotTrack?: string };
  const win = window as Window & { doNotTrack?: string };
  return nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.msDoNotTrack === '1';
}

/**
 * Snag recorder SDK.
 *
 *   import { Snag } from "@snag/sdk";
 *   Snag.init({ projectKey: "pk_live_xxx", endpoint: "https://ingest.myapp.com" });
 *
 * Records DOM events + network metadata, masks and redacts at source,
 * batches, and ships to your own ingest service. Fails quietly — it must
 * never break or noticeably slow the host app.
 */
export const Snag = {
  init(options: SnagOptions): SnagHandle {
    if (active) return active;
    const noop: SnagHandle = { stop: () => undefined, flush: () => undefined, sessionId: '' };
    if (typeof window === 'undefined' || typeof document === 'undefined') return noop;
    if (!options?.projectKey || !options?.endpoint) {
      console.warn('[snag] init skipped: projectKey and endpoint are required');
      return noop;
    }
    if (options.respectDoNotTrack !== false && doNotTrack()) return noop;

    try {
      return start(options);
    } catch (err) {
      console.warn('[snag] failed to start, recording disabled', err);
      return noop;
    }
  },

  stop(): void {
    active?.stop();
  },

  flush(): void {
    active?.flush();
  },

  get isRecording(): boolean {
    return active !== null;
  },
};

function start(options: SnagOptions): SnagHandle {
  const sessionId = getSessionId();
  const transport = new Transport({
    endpoint: options.endpoint,
    projectKey: options.projectKey,
    sessionId,
    visitorId: getVisitorId(),
    flushIntervalMs: options.flushIntervalMs ?? 5000,
    // Keep batches under the browsers' ~64KB keepalive cap so the final
    // page-hide flush (keepalive fetch / sendBeacon) is never dropped.
    maxBufferBytes: (options.maxBatchKb ?? 48) * 1024,
  });
  transport.start();

  const stopRecord = record({
    emit: (event) => transport.push(event as RawEvent),
    ...buildMaskingOptions(options),
  });

  const emitCustom = (payload: SnagPayload) => {
    try {
      record.addCustomEvent('snag', payload);
    } catch {
      // recording may have stopped — drop quietly
    }
  };

  const cleanupEmitters = installEmitters(emitCustom);
  const cleanupNetwork =
    options.captureNetwork !== false
      ? installNetworkCapture(emitCustom, {
          endpoint: options.endpoint,
          captureBodies: options.captureBodies ?? 'redacted',
          redactExtraKeys: options.redactExtraKeys ?? [],
          ignoreUrls: options.ignoreUrls ?? [],
        })
      : () => undefined;

  const onPageHide = () => transport.flush(true);
  window.addEventListener('pagehide', onPageHide);
  const onVisibility = () => {
    if (document.visibilityState === 'hidden') transport.flush(true);
  };
  document.addEventListener('visibilitychange', onVisibility);

  const handle: SnagHandle = {
    sessionId,
    flush: () => transport.flush(),
    stop: () => {
      try {
        stopRecord?.();
        cleanupEmitters();
        cleanupNetwork();
        window.removeEventListener('pagehide', onPageHide);
        document.removeEventListener('visibilitychange', onVisibility);
        transport.stop();
      } finally {
        active = null;
      }
    },
  };
  active = handle;
  return handle;
}
