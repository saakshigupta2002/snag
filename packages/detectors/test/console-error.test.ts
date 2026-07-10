import { describe, expect, it } from 'vitest';
import { consoleError } from '../src/detectors/console-error.js';
import { normalize } from '../src/normalize.js';
import { consoleErr, normalSession, snag, uncaught } from './helpers.js';

const run = (raw: Parameters<typeof normalize>[0], params = consoleError.defaultParams) =>
  consoleError.run(normalize(raw), params);

describe('console_error', () => {
  it('flags console.error as medium', () => {
    const issues = run([consoleErr(100, 'Cannot read properties of undefined')]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('medium');
  });

  it('flags uncaught exceptions as high', () => {
    const issues = run([uncaught(100, 'TypeError: x is not a function')]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.severity).toBe('high');
  });

  it('ignores console.warn', () => {
    const issues = run([snag(100, { kind: 'console', level: 'warn', message: 'deprecated' })]);
    expect(issues).toHaveLength(0);
  });

  it('groups the same message with different ids under one key', () => {
    const issues = run([
      consoleErr(100, 'Failed to load order 8231'),
      consoleErr(200, 'Failed to load order 17'),
    ]);
    expect(issues).toHaveLength(2);
    expect(issues[0]!.groupKey).toBe(issues[1]!.groupKey);
  });

  it('respects ignorePatterns', () => {
    const issues = run([consoleErr(100, 'ResizeObserver loop limit exceeded')], {
      ignorePatterns: ['ResizeObserver'],
    });
    expect(issues).toHaveLength(0);
  });

  it('passes the normal-session negative fixture', () => {
    expect(run(normalSession())).toHaveLength(0);
  });
});
