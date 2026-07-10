import type { SnagPayload } from '@snag/shared';
import { redactBodyText, redactUrl, scrubText } from './redact.js';

type Emit = (payload: SnagPayload) => void;

export interface NetworkCaptureOptions {
  /** The Snag ingest endpoint — its own traffic is never captured (no loops). */
  endpoint: string;
  captureBodies: 'redacted' | 'off';
  redactExtraKeys: string[];
  ignoreUrls: string[];
}

const BODY_MAX = 32 * 1024; // don't even read bodies bigger than this

function shouldIgnore(url: string, opts: NetworkCaptureOptions): boolean {
  if (url.includes(opts.endpoint)) return true;
  return opts.ignoreUrls.some((p) => {
    if (url.includes(p)) return true;
    try {
      return new RegExp(p, 'i').test(url);
    } catch {
      return false;
    }
  });
}

function bodyToString(body: unknown): string | undefined {
  if (typeof body === 'string') return body;
  if (body instanceof URLSearchParams) return body.toString();
  return undefined; // FormData/Blob/streams: skip rather than risk secrets
}

/**
 * Network capture with redaction at source: keep the debugging signal
 * (method, path, status, duration), drop the secret (query values, auth
 * headers, denylisted/pattern-matched body fields). Request bodies are
 * captured redacted; response bodies only for failed requests.
 */
export function installNetworkCapture(emit: Emit, opts: NetworkCaptureOptions): () => void {
  const cleanups: Array<() => void> = [];

  // ── fetch ────────────────────────────────────────────────────────────────
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (shouldIgnore(rawUrl, opts)) return origFetch(input, init);

    const method = (
      init?.method ?? (typeof input === 'object' && 'method' in input ? input.method : 'GET')
    ).toUpperCase();
    const url = redactUrl(rawUrl, opts.redactExtraKeys);
    const requestBody =
      opts.captureBodies === 'redacted'
        ? maybeRedactBody(bodyToString(init?.body), opts)
        : undefined;
    const start = Date.now();

    try {
      const res = await origFetch(input, init);
      const durationMs = Date.now() - start;
      let responseBody: string | undefined;
      if (opts.captureBodies === 'redacted' && res.status >= 400) {
        responseBody = await readResponseExcerpt(res);
        if (responseBody !== undefined) {
          responseBody = redactBodyText(responseBody, opts.redactExtraKeys);
        }
      }
      emit({ kind: 'network', method, url, status: res.status, durationMs, requestBody, responseBody });
      return res;
    } catch (err) {
      emit({
        kind: 'network',
        method,
        url,
        error: scrubText(err instanceof Error ? err.message : 'Network error'),
        durationMs: Date.now() - start,
        requestBody,
      });
      throw err;
    }
  };
  cleanups.push(() => {
    window.fetch = origFetch;
  });

  // ── XMLHttpRequest ───────────────────────────────────────────────────────
  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    type Meta = { method: string; url: string; start: number };
    const metas = new WeakMap<XMLHttpRequest, Meta>();

    XHR.prototype.open = function (this: XMLHttpRequest, ...args: unknown[]) {
      const [method, url] = args as [string, string];
      metas.set(this, { method: String(method).toUpperCase(), url: String(url), start: 0 });
      return (origOpen as (...a: unknown[]) => unknown).apply(this, args);
    } as typeof XHR.prototype.open;

    XHR.prototype.send = function (this: XMLHttpRequest, body?: Document | XMLHttpRequestBodyInit | null) {
      const meta = metas.get(this);
      if (meta && !shouldIgnore(meta.url, opts)) {
        meta.start = Date.now();
        const requestBody =
          opts.captureBodies === 'redacted' ? maybeRedactBody(bodyToString(body), opts) : undefined;
        const onLoadEnd = () => {
          const durationMs = Date.now() - meta.start;
          if (this.status === 0) {
            emit({
              kind: 'network',
              method: meta.method,
              url: redactUrl(meta.url, opts.redactExtraKeys),
              error: 'Request failed or aborted',
              durationMs,
              timedOut: durationMs >= (this.timeout || Infinity),
              requestBody,
            });
          } else {
            emit({
              kind: 'network',
              method: meta.method,
              url: redactUrl(meta.url, opts.redactExtraKeys),
              status: this.status,
              durationMs,
              requestBody,
            });
          }
        };
        this.addEventListener('loadend', onLoadEnd, { once: true });
      }
      return origSend.call(this, body as never);
    };

    cleanups.push(() => {
      XHR.prototype.open = origOpen;
      XHR.prototype.send = origSend;
    });
  }

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

function maybeRedactBody(
  body: string | undefined,
  opts: NetworkCaptureOptions,
): string | undefined {
  if (body === undefined || body.length > BODY_MAX) return undefined;
  return redactBodyText(body, opts.redactExtraKeys);
}

async function readResponseExcerpt(res: Response): Promise<string | undefined> {
  try {
    const type = res.headers.get('content-type') ?? '';
    if (!/json|text/i.test(type)) return undefined;
    const len = Number(res.headers.get('content-length') ?? 0);
    if (len > BODY_MAX) return undefined;
    return await res.clone().text();
  } catch {
    return undefined;
  }
}
