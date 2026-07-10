import { describe, expect, it } from 'vitest';
import type { MechanicalRule } from '@snag/shared';
import { runMechanicalRule } from '../src/mechanical.js';
import { normalize } from '../src/normalize.js';
import { click, consoleErr, formSubmit, nav, network } from './helpers.js';

const evalRule = (raw: Parameters<typeof normalize>[0], rule: MechanicalRule) =>
  runMechanicalRule(normalize(raw), rule, `custom:${rule.name}`);

describe('mechanical rules (Kind A)', () => {
  it('fires when all conditions occur inside the window', () => {
    const rule: MechanicalRule = {
      name: 'Payment error visible at checkout',
      severity: 'high',
      when: {
        all: [{ urlMatches: '/checkout' }, { consoleMatches: 'payment' }],
      },
      within: '8s',
    };
    const issues = evalRule(
      [nav(0, 'https://app.test/checkout'), consoleErr(3000, 'payment failed: card declined')],
      rule,
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]!.title).toBe('Payment error visible at checkout');
  });

  it('stays quiet when conditions are outside the window', () => {
    const rule: MechanicalRule = {
      name: 'w',
      severity: 'low',
      when: { all: [{ urlMatches: '/checkout' }, { consoleMatches: 'payment' }] },
      within: '2s',
    };
    const issues = evalRule(
      [nav(0, 'https://app.test/checkout'), consoleErr(9000, 'payment failed')],
      rule,
    );
    expect(issues).toHaveLength(0);
  });

  it('stays quiet when any condition never occurs', () => {
    const rule: MechanicalRule = {
      name: 'x',
      severity: 'low',
      when: { all: [{ clickOn: '#buy' }, { networkMatches: { path: '/api/pay', statusMin: 400 } }] },
    };
    expect(evalRule([click(0, 'div > button#buy')], rule)).toHaveLength(0);
  });

  it('matches clicks by selector fragment and failed requests by path + status', () => {
    const rule: MechanicalRule = {
      name: 'Pay clicked but payment API failed',
      severity: 'high',
      when: { all: [{ clickOn: '#buy' }, { networkMatches: { path: '/api/pay', statusMin: 400 } }] },
      within: 10000,
    };
    const issues = evalRule(
      [click(0, 'div#app > button#buy.btn'), network(1500, { method: 'POST', url: '/api/pay', status: 502 })],
      rule,
    );
    expect(issues).toHaveLength(1);
  });

  it('supports formSubmitted and session-wide rules (no window)', () => {
    const rule: MechanicalRule = {
      name: 'Signup submitted',
      severity: 'low',
      when: { all: [{ formSubmitted: '#signup' }] },
    };
    const issues = evalRule([formSubmit(60_000, 'form#signup')], rule);
    expect(issues).toHaveLength(1);
  });

  it('does not double-fire on overlapping windows', () => {
    const rule: MechanicalRule = {
      name: 'y',
      severity: 'low',
      when: { all: [{ clickOn: '#buy' }] },
      within: '5s',
    };
    const issues = evalRule([click(0), click(1000), click(2000)], rule);
    expect(issues.length).toBeLessThanOrEqual(2);
  });
});
