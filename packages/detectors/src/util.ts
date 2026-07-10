const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const HEX_RE = /\b[0-9a-f]{12,}\b/gi;
const NUM_SEGMENT_RE = /^\d+$/;

/** URL → pathname only (no origin, no query), tolerant of relative URLs. */
export function pathOf(url: string): string {
  try {
    return new URL(url, 'http://snag.local').pathname || '/';
  } catch {
    const q = url.indexOf('?');
    return (q === -1 ? url : url.slice(0, q)) || '/';
  }
}

/**
 * Normalize a URL path for grouping: /orders/8231/edit and /orders/17/edit
 * are the same underlying page, so id-shaped segments become ":id".
 */
export function normalizeUrlPath(url: string): string {
  const path = pathOf(url);
  const segments = path.split('/').map((seg) => {
    if (!seg) return seg;
    if (NUM_SEGMENT_RE.test(seg)) return ':id';
    if (new RegExp(`^${UUID_RE.source}$`, 'i').test(seg)) return ':id';
    if (/^[0-9a-f]{12,}$/i.test(seg)) return ':id';
    return seg;
  });
  return segments.join('/') || '/';
}

/**
 * Normalize an error message for grouping: strip ids, uuids, hex blobs and
 * numbers so "timeout for order 8231" and "timeout for order 17" group.
 */
export function normalizeMessage(message: string): string {
  return message
    .replace(UUID_RE, ':id')
    .replace(HEX_RE, ':hex')
    .replace(/\d+/g, ':n')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 140);
}

export function makeGroupKey(detector: string, key: string): string {
  return `${detector}|${key}`;
}

export function truncate(s: string, n: number): string {
  return s.length <= n ? s : `${s.slice(0, n - 1)}…`;
}

/** "8s" | "500ms" | "2m" | 8000 → milliseconds. */
export function parseDuration(v: string | number): number {
  if (typeof v === 'number') return v;
  const m = /^\s*(\d+(?:\.\d+)?)\s*(ms|s|m)?\s*$/.exec(v);
  if (!m) return 0;
  const n = Number(m[1]);
  switch (m[2]) {
    case 'm':
      return n * 60_000;
    case 's':
      return n * 1000;
    default:
      return n;
  }
}

/** Loose selector match: the rule's selector text appears in the event's selector path. */
export function selectorMatches(eventSelector: string, ruleSelector: string): boolean {
  return eventSelector.includes(ruleSelector);
}

/** Substring or regex match, tolerant of invalid regexes. */
export function patternMatches(value: string, pattern: string): boolean {
  if (value.includes(pattern)) return true;
  try {
    return new RegExp(pattern, 'i').test(value);
  } catch {
    return false;
  }
}
