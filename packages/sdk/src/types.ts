export interface SnagOptions {
  /** Public site key from the dashboard (pk_live_…). */
  projectKey: string;
  /** Base URL of your self-hosted ingest service, e.g. "https://ingest.myapp.com". */
  endpoint: string;

  /** Record every text input as dots. Default true — loosen deliberately. */
  maskAllInputs?: boolean;
  /** CSS selectors whose elements are not recorded at all (placeholder box in replay). */
  block?: string[];
  /** CSS selectors whose text is obfuscated but layout kept. */
  mask?: string[];
  /** CSS selectors allowed to record real input text (pattern safety net still applies). */
  unmask?: string[];

  /** Capture network request metadata (redaction always applied). Default true. */
  captureNetwork?: boolean;
  /** Capture redacted request bodies / failed-response bodies. Default "redacted". */
  captureBodies?: 'redacted' | 'off';
  /** Extra key names to redact everywhere, e.g. ["internal_id"]. */
  redactExtraKeys?: string[];
  /** URL substrings/regexes to skip network capture for entirely. */
  ignoreUrls?: string[];

  /** Honour the browser Do-Not-Track signal by not recording. Default true. */
  respectDoNotTrack?: boolean;
  /** Milliseconds between batch flushes. Default 5000. */
  flushIntervalMs?: number;
  /** Flush early once the buffer holds roughly this many kilobytes. Default 64. */
  maxBatchKb?: number;
}

export interface SnagHandle {
  stop(): void;
  flush(): void;
  sessionId: string;
}
