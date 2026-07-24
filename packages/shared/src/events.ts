/**
 * Event model.
 *
 * A session is an ordered stream of rrweb events. Snag adds its own
 * lightweight signals (clicks, console, network, navigation, forms) as rrweb
 * custom events (type 5) with tag "snag", so replay and detection read one
 * unified stream.
 */

/** Raw rrweb event envelope. `data` is opaque to Snag except for custom events. */
export interface RawEvent {
  type: number;
  data: unknown;
  timestamp: number;
}

/** rrweb event type constants (subset Snag cares about). */
export const RRWEB_TYPE = {
  FullSnapshot: 2,
  IncrementalSnapshot: 3,
  Meta: 4,
  Custom: 5,
} as const;

/** rrweb incremental-snapshot source constants (subset Snag cares about). */
export const RRWEB_SOURCE = {
  Mutation: 0,
  MouseMove: 1,
  MouseInteraction: 2,
  Scroll: 3,
  Input: 5,
} as const;

export const SNAG_CUSTOM_TAG = 'snag';

/** Payloads Snag emits as rrweb custom events. */
export type SnagPayload =
  | ClickPayload
  | ConsolePayload
  | ErrorPayload
  | NetworkPayload
  | NavigationPayload
  | FormPayload
  | PageHidePayload
  | VitalsPayload;

export interface ClickPayload {
  kind: 'click';
  /** Stable-ish CSS selector path of the click target. */
  selector: string;
  /** Visible text of the target, truncated + masked upstream. */
  text?: string;
  x: number;
  y: number;
}

export interface ConsolePayload {
  kind: 'console';
  level: 'error' | 'warn';
  message: string;
}

export interface ErrorPayload {
  kind: 'error';
  message: string;
  stack?: string;
  source: 'uncaught' | 'unhandledrejection';
}

export interface NetworkPayload {
  kind: 'network';
  method: string;
  /** URL with query values redacted at capture time. */
  url: string;
  status?: number;
  /** Present when the request errored before a response (network error). */
  error?: string;
  durationMs: number;
  timedOut?: boolean;
  /** Deep-redacted request/response body excerpts, when body capture is on. */
  requestBody?: string;
  responseBody?: string;
}

export interface NavigationPayload {
  kind: 'navigation';
  url: string;
  from?: string;
  trigger: 'initial' | 'push' | 'replace' | 'pop';
}

export interface FormPayload {
  kind: 'form';
  action: 'engage' | 'submit' | 'invalid';
  formSelector: string;
  fieldSelector?: string;
}

export interface PageHidePayload {
  kind: 'page_hide';
}

/** Core Web Vitals, captured once per page on pagehide. INP is approximated
 *  as the longest interaction (event) duration observed. */
export interface VitalsPayload {
  kind: 'vitals';
  /** Largest Contentful Paint, ms. */
  lcpMs?: number;
  /** Interaction to Next Paint (approx: max event duration), ms. */
  inpMs?: number;
  /** Cumulative Layout Shift, unitless score. */
  cls?: number;
}

/** Shape of an rrweb custom event carrying a Snag payload. */
export interface SnagCustomEvent extends RawEvent {
  type: typeof RRWEB_TYPE.Custom;
  data: { tag: typeof SNAG_CUSTOM_TAG; payload: SnagPayload };
}

export function isSnagEvent(e: RawEvent): e is SnagCustomEvent {
  if (e.type !== RRWEB_TYPE.Custom) return false;
  const d = e.data as { tag?: unknown; payload?: unknown } | null;
  return !!d && d.tag === SNAG_CUSTOM_TAG && typeof d.payload === 'object' && d.payload !== null;
}

export function snagPayload(e: RawEvent): SnagPayload | undefined {
  return isSnagEvent(e) ? e.data.payload : undefined;
}
