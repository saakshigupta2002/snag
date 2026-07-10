const KEY = 'snag:sid';

/** One session per tab, surviving reloads (sessionStorage), UUID-shaped. */
export function getSessionId(): string {
  let sid: string | null = null;
  try {
    sid = sessionStorage.getItem(KEY);
  } catch {
    // storage blocked — fall through to ephemeral id
  }
  if (!sid) {
    sid =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto
        ? crypto.randomUUID()
        : `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    try {
      sessionStorage.setItem(KEY, sid);
    } catch {
      // best effort
    }
  }
  return sid;
}
