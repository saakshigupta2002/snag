// A "mission" = a Playwright test that uses your app the way a user would, while
// the Snag SDK records it. `snag explore run` fills the placeholders and runs
// one of these per mission (in parallel). This template is the heuristic
// "walk the app safely" mission; the snag-explore skill can write smarter,
// goal-directed ones (e.g. "complete signup", "try to break checkout").
//
// Placeholders replaced by the engine: __START__, __NAME__, __SAFE_MODE__.

const { test } = require('@playwright/test');
const { installSafetyNet } = require('./safety-net.js');

const START = '__START__';
const SAFE_MODE = __SAFE_MODE__;
const DESTRUCTIVE = ['delete', 'remove', 'pay', 'purchase', 'buy', 'charge',
  'subscribe', 'cancel', 'deactivate', 'close account', 'send'];

test('__NAME__', async ({ page }) => {
  await installSafetyNet(page);              // payments/email are faked: safe
  await page.goto(START, { waitUntil: 'domcontentloaded' });

  for (let step = 0; step < 8; step++) {
    // Fill visible inputs with harmless test data.
    for (const input of (await page.locator('input:visible, textarea:visible').all()).slice(0, 5)) {
      const type = (await input.getAttribute('type')) || 'text';
      const value = type === 'email' ? 'test@example.com'
        : type === 'password' ? 'Test1234!' : 'test';
      try { await input.fill(value); } catch (e) { /* not fillable */ }
    }
    // Click the first safe control; skip anything destructive in safe mode.
    let clicked = false;
    for (const el of await page.locator('button:visible, [role=button]:visible, a[href]:visible').all()) {
      const label = ((await el.innerText().catch(() => '')) || '').toLowerCase();
      if (SAFE_MODE && DESTRUCTIVE.some((w) => label.includes(w))) continue;
      try { await el.click({ timeout: 1500 }); clicked = true; break; } catch (e) { /* covered */ }
    }
    await page.waitForTimeout(600);
    if (!clicked) break;
  }
});
