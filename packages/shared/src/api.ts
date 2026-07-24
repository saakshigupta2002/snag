import type { RawEvent } from './events.js';

/** POST /ingest body — a batch of already-masked/redacted events. */
export interface IngestPayload {
  projectKey: string;
  sessionId: string;
  events: RawEvent[];
  seqFrom: number;
  seqTo: number;
  meta: {
    url?: string;
    ts: number;
    userAgent?: string;
    device?: string;
    /** document.referrer at session start (external referrer). First flush only. */
    referrer?: string;
    /** Stable per-browser id (localStorage) for unique / returning-user counts. */
    visitorId?: string;
    /** Set on the final flush (pagehide) so the session seals promptly. */
    final?: boolean;
  };
}
