import { describe, expect, it } from 'vitest';
import { formAbandonment } from '../src/detectors/form-abandonment.js';
import { normalize } from '../src/normalize.js';
import { formEngage, formSubmit, nav, normalSession, pageHide } from './helpers.js';

const run = (raw: Parameters<typeof normalize>[0]) =>
  formAbandonment.run(normalize(raw), formAbandonment.defaultParams);

describe('form_abandonment', () => {
  it('flags a form engaged then left via navigation', () => {
    const issues = run([
      nav(0, 'https://app.test/signup', 'initial'),
      formEngage(1000),
      nav(8000, 'https://app.test/pricing'),
    ]);
    expect(issues).toHaveLength(1);
    expect(issues[0]!.meta['formSelector']).toBe('form#signup');
  });

  it('flags a form engaged then left via page hide', () => {
    const issues = run([formEngage(1000), pageHide(9000)]);
    expect(issues).toHaveLength(1);
  });

  it('stays quiet when the form was submitted', () => {
    const issues = run([formEngage(1000), formSubmit(5000), pageHide(9000)]);
    expect(issues).toHaveLength(0);
  });

  it('respects minFieldsInteracted', () => {
    const events = normalize([formEngage(1000, 'form#f', 'input#one'), pageHide(9000)]);
    expect(formAbandonment.run(events, { minFieldsInteracted: 2 })).toHaveLength(0);
  });

  it('passes the normal-session negative fixture', () => {
    expect(run(normalSession())).toHaveLength(0);
  });
});
