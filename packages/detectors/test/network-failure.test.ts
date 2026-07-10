import { describe, expect, it } from 'vitest';
import { networkFailure } from '../src/detectors/network-failure.js';
import { normalize } from '../src/normalize.js';
import { network, normalSession } from './helpers.js';

const run = (raw: Parameters<typeof normalize>[0], params = networkFailure.defaultParams) =>
  networkFailure.run(normalize(raw), params);

describe('network_failure', () => {
  it('flags 5xx as high', () => {
    const issues = run([network(0, { method: 'POST', url: '/api/login', status: 500 })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('high');
    expect(issues[0]!.title).toContain('POST /api/login');
  });

  it('flags 4xx as medium', () => {
    const issues = run([network(0, { status: 404 })]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('medium');
  });

  it('flags network errors and timeouts as high', () => {
    expect(run([network(0, { error: 'Failed to fetch', durationMs: 20 })])[0]!.severity).toBe('high');
    expect(run([network(0, { timedOut: true, durationMs: 10001 })])[0]!.severity).toBe('high');
  });

  it('ignores healthy responses', () => {
    expect(run([network(0, { status: 200 }), network(10, { status: 302 })])).toHaveLength(0);
  });

  it('respects ignoreUrls', () => {
    const issues = run([network(0, { url: '/analytics/beacon', status: 500 })], {
      ...networkFailure.defaultParams,
      ignoreUrls: ['/analytics/'],
    });
    expect(issues).toHaveLength(0);
  });

  it('groups by method + normalized path + status class', () => {
    const issues = run([
      network(0, { method: 'GET', url: '/api/orders/123', status: 500 }),
      network(10, { method: 'GET', url: '/api/orders/456', status: 503 }),
    ]);
    expect(issues[0]!.groupKey).toBe(issues[1]!.groupKey);
  });

  it('passes the normal-session negative fixture', () => {
    expect(run(normalSession())).toHaveLength(0);
  });
});
