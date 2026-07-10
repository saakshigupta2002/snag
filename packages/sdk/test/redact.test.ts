import { describe, expect, it } from 'vitest';
import {
  isDenylistedKey,
  looksSensitive,
  luhnValid,
  maskChars,
  redactBodyText,
  redactHeaders,
  redactUrl,
  scrubText,
} from '../src/redact.js';

const JWT =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U';

describe('key denylist', () => {
  it('catches obvious and dressed-up key names', () => {
    for (const k of ['password', 'PASSWORD', 'api-key', 'Access_Token', 'stripe_secret', 'cardNumber', 'x-auth']) {
      expect(isDenylistedKey(k), k).toBe(true);
    }
  });
  it('leaves harmless keys alone', () => {
    for (const k of ['email_subject', 'title', 'status', 'durationMs', 'page']) {
      expect(isDenylistedKey(k), k).toBe(false);
    }
  });
});

describe('value-shape safety net', () => {
  it('flags emails, JWTs, cards (luhn-valid), long tokens, bearer values', () => {
    expect(looksSensitive('user@example.com')).toBe(true);
    expect(looksSensitive(JWT)).toBe(true);
    expect(looksSensitive('4242 4242 4242 4242')).toBe(true);
    expect(looksSensitive('faketok_a1B2c3D4e5F6g7H8i9J0k1L2')).toBe(true);
    expect(looksSensitive('Bearer abc123')).toBe(true);
  });
  it('does not flag ordinary content', () => {
    expect(looksSensitive('Add to cart')).toBe(false);
    expect(looksSensitive('Order #8231 shipped')).toBe(false);
    expect(looksSensitive('the quick brown fox jumps over')).toBe(false);
  });
  it('luhn rejects random digit runs', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(luhnValid('1234567890123456')).toBe(false);
  });
});

describe('scrubText', () => {
  it('replaces only the sensitive tokens, keeps the signal', () => {
    const out = scrubText(`Login failed for user@example.com with token ${JWT}`);
    expect(out).not.toContain('user@example.com');
    expect(out).not.toContain(JWT);
    expect(out).toContain('Login failed for');
  });
});

describe('redactUrl', () => {
  it('redacts denylisted and sensitive-looking query values, keeps the path', () => {
    const out = redactUrl('https://api.test/v1/login?user=bob&token=faketok_a1B2c3D4e5F6g7H8i9J0k1L2&tab=2');
    expect(out).toContain('/v1/login');
    expect(out).not.toContain('faketok_a1B2c3D4e5F6g7H8i9J0k1L2');
    expect(out).toContain('tab=2');
  });
  it('keeps relative URLs relative', () => {
    expect(redactUrl('/api/data?page=1')).toBe('/api/data?page=1');
  });
});

describe('redactHeaders', () => {
  it('always kills authorization and cookies, keeps harmless headers', () => {
    const out = redactHeaders({
      Authorization: 'Bearer shhh',
      Cookie: 'sid=123',
      'Content-Type': 'application/json',
      'X-Api-Key': 'whatever',
    });
    expect(out['Authorization']).toBe('***');
    expect(out['Cookie']).toBe('***');
    expect(out['X-Api-Key']).toBe('***');
    expect(out['Content-Type']).toBe('application/json');
  });
});

describe('redactBodyText', () => {
  it('deep-redacts denylisted keys in JSON bodies', () => {
    const out = redactBodyText(
      JSON.stringify({
        email: 'bob@example.com',
        password: 'hunter2',
        nested: { apiKey: 'faketok_a1B2c3D4e5F6g7H8i9J0k1L2', plan: 'pro' },
        note: 'call me',
      }),
    );
    expect(out).not.toContain('hunter2');
    expect(out).not.toContain('bob@example.com');
    expect(out).not.toContain('faketok_a1B2c3D4e5F6g7H8i9J0k1L2');
    expect(out).toContain('pro');
    expect(out).toContain('call me');
  });
  it('catches a secret under a non-obvious key name via value shape', () => {
    const out = redactBodyText(JSON.stringify({ blob: JWT }));
    expect(out).not.toContain(JWT);
  });
  it('scrubs non-JSON bodies by pattern', () => {
    const out = redactBodyText(`plain text with card 4242-4242-4242-4242 inside`);
    expect(out).not.toContain('4242-4242-4242-4242');
  });
  it('truncates giant bodies', () => {
    const out = redactBodyText(JSON.stringify({ data: 'x'.repeat(10_000) }));
    expect(out.length).toBeLessThanOrEqual(4097);
  });
});

describe('maskChars', () => {
  it('keeps length, hides content', () => {
    expect(maskChars('hunter2')).toBe('*******');
  });
});
