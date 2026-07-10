export const AUTH_COOKIE = 'snag_auth';

/**
 * Single-user auth for v1: the dashboard password lives in
 * DASHBOARD_PASSWORD; the session cookie is an HMAC bound to both the
 * password and SNAG_SECRET, so rotating either invalidates sessions.
 * Uses Web Crypto so it runs in both the edge middleware and node routes.
 */
export async function expectedToken(): Promise<string | undefined> {
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.SNAG_SECRET ?? 'snag-dev-secret';
  if (!password) return undefined; // auth disabled (local hacking)
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`snag-session-v1|${password}`));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function isAuthed(cookieValue: string | undefined): Promise<boolean> {
  const expected = await expectedToken();
  if (expected === undefined) return true; // no password configured
  return !!cookieValue && timingSafeEqual(cookieValue, expected);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
