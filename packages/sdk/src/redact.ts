/**
 * Redaction — pure functions, no DOM. Two layers, because either can miss:
 *   (1) by key name  — a denylist of key names catches the obvious cases
 *   (2) by pattern   — a value-shape safety net catches secrets named oddly
 * Everything runs in the browser BEFORE transmission: a raw secret must never
 * enter the database, then it physically cannot leak from the dashboard.
 */

export const DENYLIST_KEYS = [
  'password',
  'passwd',
  'pwd',
  'secret',
  'token',
  'auth',
  'authorization',
  'apikey',
  'api_key',
  'access_token',
  'refresh_token',
  'id_token',
  'client_secret',
  'private_key',
  'credential',
  'card',
  'cardnumber',
  'card_number',
  'cvv',
  'cvc',
  'ssn',
  'pin',
  'otp',
  'mfa',
  'cookie',
  'session',
] as const;

const REDACTED = '***';

function normalizeKey(key: string): string {
  return key.toLowerCase().replace(/[-_\s.]/g, '');
}

export function isDenylistedKey(key: string, extraKeys: string[] = []): boolean {
  const k = normalizeKey(key);
  const all = [...DENYLIST_KEYS, ...extraKeys.map(normalizeKey)];
  return all.some((d) => k.includes(normalizeKey(d)));
}

// ── Value-shape patterns (the safety net) ─────────────────────────────────────

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;
const JWT_RE = /\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\b/;
const CARD_RE = /\b(?:\d[ -]?){13,19}\b/;
// ≥24 chars of token alphabet containing both letters and digits — API-key shaped.
const LONG_TOKEN_RE = /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])[A-Za-z0-9_-]{24,}\b/;
const BEARER_RE = /\bbearer\s+\S+/i;

export function luhnValid(digits: string): boolean {
  const clean = digits.replace(/[ -]/g, '');
  if (!/^\d{13,19}$/.test(clean)) return false;
  let sum = 0;
  let double = false;
  for (let i = clean.length - 1; i >= 0; i--) {
    let d = clean.charCodeAt(i) - 48;
    if (double) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    double = !double;
  }
  return sum % 10 === 0;
}

/** Does this value LOOK like a secret/PII regardless of what it's called? */
export function looksSensitive(value: string): boolean {
  if (EMAIL_RE.test(value)) return true;
  if (JWT_RE.test(value)) return true;
  if (BEARER_RE.test(value)) return true;
  const card = CARD_RE.exec(value);
  if (card && luhnValid(card[0])) return true;
  if (LONG_TOKEN_RE.test(value)) return true;
  return false;
}

/** Replace sensitive-shaped tokens inside otherwise-useful text with ***. */
export function scrubText(text: string): string {
  let out = text
    .replace(new RegExp(EMAIL_RE.source, 'g'), REDACTED)
    .replace(new RegExp(JWT_RE.source, 'g'), REDACTED)
    .replace(new RegExp(BEARER_RE.source, 'gi'), `bearer ${REDACTED}`)
    .replace(new RegExp(LONG_TOKEN_RE.source, 'g'), REDACTED);
  out = out.replace(new RegExp(CARD_RE.source, 'g'), (m) => (luhnValid(m) ? REDACTED : m));
  return out;
}

/** Mask visible characters but keep length/shape (for input echoes). */
export function maskChars(text: string): string {
  return '*'.repeat(text.length);
}

// ── Structured redaction ─────────────────────────────────────────────────────

/** Redact query-string values by key + pattern; keep origin and path intact. */
export function redactUrl(url: string, extraKeys: string[] = []): string {
  try {
    const u = new URL(url, typeof location !== 'undefined' ? location.href : 'http://snag.local');
    let changed = false;
    for (const [k, v] of u.searchParams.entries()) {
      if (isDenylistedKey(k, extraKeys) || looksSensitive(v)) {
        u.searchParams.set(k, REDACTED);
        changed = true;
      }
    }
    void changed;
    const isRelative = !/^[a-z][a-z0-9+.-]*:/i.test(url);
    return isRelative ? u.pathname + u.search + u.hash : u.toString();
  } catch {
    return scrubText(url);
  }
}

/** Authorization headers and cookies — always. Others by key + pattern. */
export function redactHeaders(
  headers: Record<string, string>,
  extraKeys: string[] = [],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) {
    const key = k.toLowerCase();
    if (key === 'authorization' || key === 'cookie' || key === 'set-cookie' || key === 'proxy-authorization') {
      out[k] = REDACTED;
    } else if (isDenylistedKey(k, extraKeys) || looksSensitive(v)) {
      out[k] = REDACTED;
    } else {
      out[k] = v;
    }
  }
  return out;
}

function deepRedact(value: unknown, extraKeys: string[], depth: number): unknown {
  if (depth > 6) return REDACTED;
  if (typeof value === 'string') return looksSensitive(value) ? REDACTED : value;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => deepRedact(v, extraKeys, depth + 1));
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    out[k] = isDenylistedKey(k, extraKeys) ? REDACTED : deepRedact(v, extraKeys, depth + 1);
  }
  return out;
}

/**
 * Redact a request/response body string. JSON gets deep key+pattern
 * redaction; anything else gets pattern scrubbing. Output is capped.
 */
export function redactBodyText(
  body: string,
  extraKeys: string[] = [],
  maxLen = 4096,
): string {
  let out: string;
  try {
    const parsed = JSON.parse(body) as unknown;
    out = JSON.stringify(deepRedact(parsed, extraKeys, 0));
  } catch {
    out = scrubText(body);
  }
  return out.length > maxLen ? `${out.slice(0, maxLen)}…` : out;
}
