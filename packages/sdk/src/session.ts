const KEY = 'snag:sid';
const VISITOR_KEY = 'snag:vid';

function newId(prefix: string): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** One session per tab, surviving reloads (sessionStorage), UUID-shaped. */
export function getSessionId(): string {
  let sid: string | null = null;
  try {
    sid = sessionStorage.getItem(KEY);
  } catch {
    // storage blocked — fall through to ephemeral id
  }
  if (!sid) {
    sid = newId('s');
    try {
      sessionStorage.setItem(KEY, sid);
    } catch {
      // best effort
    }
  }
  return sid;
}

/** Stable per-browser id (localStorage), survives across sessions/visits. */
export function getVisitorId(): string {
  let vid: string | null = null;
  try {
    vid = localStorage.getItem(VISITOR_KEY);
  } catch {
    // storage blocked — ephemeral id, counts this visit as a new user
  }
  if (!vid) {
    vid = newId('v');
    try {
      localStorage.setItem(VISITOR_KEY, vid);
    } catch {
      // best effort
    }
  }
  return vid;
}
