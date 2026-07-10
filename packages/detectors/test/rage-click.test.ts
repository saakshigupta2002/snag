import { describe, expect, it } from 'vitest';
import { rageClick } from '../src/detectors/rage-click.js';
import { normalize } from '../src/normalize.js';
import { click, mutation, nav, normalSession } from './helpers.js';

const run = (raw: Parameters<typeof normalize>[0]) =>
  rageClick.run(normalize(raw), rageClick.defaultParams);

describe('rage_click', () => {
  it('flags ≥4 clicks in 1s in one spot with no reaction', () => {
    const issues = run([click(0), click(150), click(300), click(450), click(600)]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.detector).toBe('rage_click');
    expect(issues[0]!.meta['clicks']).toBe(5);
    expect(issues[0]!.severity).toBe('medium');
  });

  it('stays quiet when the page reacts (mutation during the burst)', () => {
    const issues = run([click(0), click(150), mutation(200), click(300), click(450), click(600)]);
    expect(issues).toHaveLength(0);
  });

  it('stays quiet when a navigation follows immediately', () => {
    const issues = run([
      click(0),
      click(150),
      click(300),
      click(450),
      nav(700, 'https://app.test/next'),
    ]);
    expect(issues).toHaveLength(0);
  });

  it('stays quiet for slow, spread-out clicking', () => {
    const issues = run([click(0), click(900), click(1800), click(2700), click(3600)]);
    expect(issues).toHaveLength(0);
  });

  it('stays quiet for clicks on different elements', () => {
    const issues = run([
      click(0, 'button#a'),
      click(150, 'button#b'),
      click(300, 'button#c'),
      click(450, 'button#d'),
    ]);
    expect(issues).toHaveLength(0);
  });

  it('respects a tuned clicks threshold', () => {
    const events = normalize([click(0), click(150), click(300)]);
    expect(rageClick.run(events, { ...rageClick.defaultParams, clicks: 3 })).toHaveLength(1);
    expect(rageClick.run(events, { ...rageClick.defaultParams, clicks: 4 })).toHaveLength(0);
  });

  it('passes the normal-session negative fixture', () => {
    expect(run(normalSession())).toHaveLength(0);
  });
});
