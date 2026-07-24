function pathOf(meta: Record<string, unknown>): string {
  const raw = (meta.page as string) || (meta.url as string) || '';
  if (!raw) return 'the page';
  try {
    return new URL(raw, 'http://x.local').pathname || raw;
  } catch {
    return raw;
  }
}

/**
 * Plain-English account of what a detector actually saw, built from the
 * candidate's `meta`. Shown whether or not an AI summary is available, so every
 * issue explains itself instead of leaving the reader to guess from the title.
 */
export function describeIssue(detector: string, meta: Record<string, unknown>): string {
  const m = meta as Record<string, string | number | boolean | undefined> & Record<string, unknown>;
  const secs = (ms: unknown) => `${Math.max(Math.round(Number(ms) / 1000), 0)}s`;
  switch (detector) {
    case 'console_error':
      return `A JavaScript error ${m.uncaught ? 'was thrown and left uncaught' : 'was logged'}: “${m.message ?? 'unknown error'}”. Uncaught errors usually mean something on the page stopped working for the user.`;
    case 'network_failure': {
      const outcome = m.timedOut
        ? 'timed out'
        : m.status
          ? `returned HTTP ${m.status}`
          : m.error
            ? `failed (${m.error})`
            : 'failed';
      return `A ${m.method ?? 'network'} request to ${pathOf(meta)} ${outcome}${m.durationMs ? ` after ${Math.round(Number(m.durationMs))}ms` : ''}. The user likely saw missing data or a broken action.`;
    }
    case 'rage_click':
      return `The user clicked ${m.text ? `“${m.text}”` : m.selector} ${m.clicks ?? 'several'} times in quick succession with no visible response — the control looked clickable but did nothing.`;
    case 'dead_click':
      return `The user clicked ${m.text ? `“${m.text}”` : m.selector} but nothing on the page reacted.`;
    case 'form_abandonment':
      return `A form (${m.formSelector}) was started${m.fieldsInteracted ? ` — ${m.fieldsInteracted} field(s) touched` : ''} but never submitted.`;
    case 'repeated_form_errors':
      return `A form (${m.formSelector}) was rejected ${m.rejections ?? 'several'} times — the user kept hitting validation errors.`;
    case 'backward_navigation':
      return `The user opened ${m.page} then bounced straight back to ${m.returnedTo}${m.dwellMs ? ` after only ${secs(m.dwellMs)}` : ''}.`;
    case 'navigation_thrash':
      return `The user bounced repeatedly between ${Array.isArray(m.pages) ? m.pages.join(' ↔ ') : 'two pages'} (${m.hops ?? 'several'} hops) — usually a sign they couldn't find what they needed.`;
    case 'refresh_spam':
      return `${m.page} was reloaded ${m.reloads ?? 'several'} times in a row — often a sign the page felt stuck or broken.`;
    case 'rapid_bounce':
      return `The user left ${m.page} almost immediately${m.durationMs ? ` (after ${secs(m.durationMs)})` : ''}.`;
    default:
      return '';
  }
}

/**
 * The raw signal a dev can act on without watching the replay: an error's stack
 * trace, or the failed request line. Returns null when there's nothing crisp to
 * show (behavioural detectors — the finding + replay carry those).
 */
export function evidenceCode(detector: string, meta: Record<string, unknown>): string | null {
  const m = meta as Record<string, string | number | boolean | undefined>;
  if (detector === 'console_error') {
    if (typeof m.stack === 'string' && m.stack.trim()) return m.stack.trim();
    if (typeof m.message === 'string') return m.message;
    return null;
  }
  if (detector === 'network_failure') {
    const url = (m.url as string) || (m.page as string) || '';
    const outcome = m.timedOut ? 'timed out' : m.status ? String(m.status) : m.error ? String(m.error) : 'failed';
    return `${m.method ?? 'GET'} ${url}\n→ ${outcome}${m.durationMs ? `  ·  ${Math.round(Number(m.durationMs))}ms` : ''}`;
  }
  return null;
}

/**
 * Prioritisation signals derived from when/how often an issue fires.
 * `isNew`: first seen in the last 3 days. `isSpike`: today's count is well
 * above the recent baseline — a regression worth looking at first.
 */
export function issueSignals(
  firstSeen: string,
  trend: { count: number }[],
): { isNew: boolean; isSpike: boolean } {
  const firstMs = Date.parse(firstSeen);
  const isNew = Number.isFinite(firstMs) && Date.now() - firstMs < 3 * 24 * 60 * 60 * 1000;
  let isSpike = false;
  if (trend.length >= 3) {
    const last = trend[trend.length - 1]!.count;
    const prior = trend.slice(0, -1);
    const avg = prior.reduce((s, p) => s + p.count, 0) / prior.length;
    isSpike = last >= 3 && avg > 0 && last >= avg * 2;
  }
  return { isNew, isSpike };
}
