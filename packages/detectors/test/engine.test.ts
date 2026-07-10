import { describe, expect, it } from 'vitest';
import type { MechanicalRule } from '@snag/shared';
import { runEngine, type EngineRule } from '../src/engine.js';
import {
  click,
  consoleErr,
  mutation,
  nav,
  network,
  normalSession,
  pageHide,
} from './helpers.js';

describe('runEngine', () => {
  it('produces zero issues for a healthy session', () => {
    expect(runEngine(normalSession())).toHaveLength(0);
  });

  it('finds multiple problems in a rough session and orders them by time', () => {
    const issues = runEngine([
      nav(0, 'https://app.test/checkout', 'initial'),
      consoleErr(500, 'payment widget failed to init'),
      network(1000, { method: 'POST', url: '/api/pay', status: 500 }),
      click(2000),
      click(2150),
      click(2300),
      click(2450),
      pageHide(30000),
    ]);
    const detectors = issues.map((i) => i.detector);
    expect(detectors).toContain('console_error');
    expect(detectors).toContain('network_failure');
    expect(detectors).toContain('rage_click');
    expect([...issues].sort((a, b) => a.tsStart - b.tsStart)).toEqual(issues);
  });

  it('dedupes repeats of one bug into a single candidate with a count', () => {
    const issues = runEngine([
      network(0, { method: 'GET', url: '/api/orders/1', status: 500 }),
      network(100, { method: 'GET', url: '/api/orders/2', status: 500 }),
      network(200, { method: 'GET', url: '/api/orders/3', status: 500 }),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.occurrences).toBe(3);
  });

  it('honors a disabled rule', () => {
    const rules: EngineRule[] = [
      { detector: 'console_error', kind: 'builtin', enabled: false, params: {} },
    ];
    expect(runEngine([consoleErr(0, 'boom'), pageHide(5000)], rules)).toHaveLength(0);
  });

  it('honors tuned params', () => {
    const burst = [click(0), click(150), click(300), pageHide(20000)];
    expect(
      runEngine(burst, [
        { detector: 'rage_click', kind: 'builtin', enabled: true, params: { clicks: 3 } },
        { detector: 'dead_click', kind: 'builtin', enabled: false, params: {} },
      ]),
    ).toHaveLength(1);
  });

  it('runs enabled mechanical custom flags', () => {
    const rule: MechanicalRule = {
      name: 'Clicked pay on checkout',
      severity: 'high',
      when: { all: [{ urlMatches: '/checkout' }, { clickOn: '#buy' }] },
      within: '8s',
    };
    const rules: EngineRule[] = [
      { detector: 'custom:clicked-pay', kind: 'custom_mechanical', enabled: true, params: { rule } },
      // Quiet the built-ins that would also fire on this stream.
      { detector: 'dead_click', kind: 'builtin', enabled: false, params: {} },
    ];
    const issues = runEngine(
      [nav(0, 'https://app.test/checkout', 'initial'), click(2000), mutation(2100), pageHide(9000)],
      rules,
    );
    expect(issues.map((i) => i.detector)).toContain('custom:clicked-pay');
    expect(issues.find((i) => i.detector === 'custom:clicked-pay')!.severity).toBe('high');
  });

  it('keeps Tier 2 detectors off by default', () => {
    // 3 reloads of one page: refresh_spam material, but it ships disabled.
    const issues = runEngine([
      nav(0, 'https://app.test/', 'initial'),
      nav(3000, 'https://app.test/', 'initial'),
      nav(6000, 'https://app.test/', 'initial'),
      click(8000),
      mutation(8100),
      pageHide(20000),
    ]);
    expect(issues.map((i) => i.detector)).not.toContain('refresh_spam');
  });

  it('can enable a Tier 2 detector per project', () => {
    const issues = runEngine(
      [
        nav(0, 'https://app.test/', 'initial'),
        nav(3000, 'https://app.test/', 'initial'),
        nav(6000, 'https://app.test/', 'initial'),
        click(8000),
        mutation(8100),
        pageHide(20000),
      ],
      [{ detector: 'refresh_spam', kind: 'builtin', enabled: true, params: {} }],
    );
    expect(issues.map((i) => i.detector)).toContain('refresh_spam');
  });
});
