import { describe, expect, it } from 'vitest';
import { normalizeMessage, normalizeUrlPath, parseDuration } from '../src/util.js';

describe('normalizeUrlPath', () => {
  it('strips origin and query', () => {
    expect(normalizeUrlPath('https://app.test/orders?tab=open')).toBe('/orders');
  });
  it('replaces id-shaped segments', () => {
    expect(normalizeUrlPath('/orders/8231/edit')).toBe('/orders/:id/edit');
    expect(normalizeUrlPath('/u/550e8400-e29b-41d4-a716-446655440000')).toBe('/u/:id');
    expect(normalizeUrlPath('/files/deadbeefdeadbeef')).toBe('/files/:id');
  });
  it('keeps normal segments', () => {
    expect(normalizeUrlPath('/pricing/enterprise')).toBe('/pricing/enterprise');
  });
});

describe('normalizeMessage', () => {
  it('collapses ids and numbers so repeats group', () => {
    const a = normalizeMessage('Failed to load order 8231');
    const b = normalizeMessage('Failed to load order 17');
    expect(a).toBe(b);
  });
});

describe('parseDuration', () => {
  it('parses ms, s, m and bare numbers', () => {
    expect(parseDuration(250)).toBe(250);
    expect(parseDuration('500ms')).toBe(500);
    expect(parseDuration('8s')).toBe(8000);
    expect(parseDuration('2m')).toBe(120000);
  });
});
