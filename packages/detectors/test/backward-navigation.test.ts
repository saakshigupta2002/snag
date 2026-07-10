import { describe, expect, it } from 'vitest';
import { backwardNavigation } from '../src/detectors/backward-navigation.js';
import { normalize } from '../src/normalize.js';
import { nav, normalSession } from './helpers.js';

const run = (raw: Parameters<typeof normalize>[0]) =>
  backwardNavigation.run(normalize(raw), backwardNavigation.defaultParams);

describe('backward_navigation', () => {
  it('flags A → B → A within the window', () => {
    const issues = run([
      nav(0, 'https://app.test/home', 'initial'),
      nav(5000, 'https://app.test/settings'),
      nav(8000, 'https://app.test/home', 'pop'),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.meta['page']).toBe('/settings');
  });

  it('stays quiet when the return takes longer than the window', () => {
    const issues = run([
      nav(0, 'https://app.test/home', 'initial'),
      nav(5000, 'https://app.test/settings'),
      nav(40000, 'https://app.test/home', 'pop'),
    ]);
    expect(issues).toHaveLength(0);
  });

  it('stays quiet for forward journeys (A → B → C)', () => {
    const issues = run([
      nav(0, 'https://app.test/home', 'initial'),
      nav(5000, 'https://app.test/step-1'),
      nav(8000, 'https://app.test/step-2'),
    ]);
    expect(issues).toHaveLength(0);
  });

  it('passes the normal-session negative fixture', () => {
    expect(run(normalSession())).toHaveLength(0);
  });
});
