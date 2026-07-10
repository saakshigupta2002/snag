import { describe, expect, it } from 'vitest';
import { deadClick } from '../src/detectors/dead-click.js';
import { normalize } from '../src/normalize.js';
import { click, mutation, network, normalSession, pageHide } from './helpers.js';

const run = (raw: Parameters<typeof normalize>[0]) =>
  deadClick.run(normalize(raw), deadClick.defaultParams);

describe('dead_click', () => {
  it('flags a click with no reaction inside the quiet window', () => {
    const issues = run([click(0), pageHide(10000)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detector).toBe('dead_click');
    expect(issues[0]!.title).toContain('Dead click');
  });

  it('stays quiet when a mutation follows quickly', () => {
    expect(run([click(0), mutation(200), pageHide(10000)])).toHaveLength(0);
  });

  it('stays quiet when a network request follows', () => {
    expect(run([click(0), network(400, { status: 200 }), pageHide(10000)])).toHaveLength(0);
  });

  it('skips clicks too close to session end (unknowable)', () => {
    expect(run([click(0), pageHide(1000)])).toHaveLength(0);
  });

  it('ignores clicks on non-interactive targets by default', () => {
    expect(run([click(0, 'div#app > p.copy'), pageHide(10000)])).toHaveLength(0);
  });

  it('passes the normal-session negative fixture', () => {
    expect(run(normalSession())).toHaveLength(0);
  });
});
