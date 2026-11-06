// Playwright safety net for `snag explore`.
//
// Intercepts calls to known payment / email / SMS providers and answers them
// with a fake success (HTTP 200). Nothing real fires and because the request
// "succeeds", Snag records no false network error for it.
//
// `snag explore run` writes an active copy of this next to the generated specs;
// `snag explore scaffold` copies it into your project so you can extend the
// host list. Add your own internal side-effecting endpoints to RISKY_HOSTS.

const RISKY_HOSTS = [
  'api.stripe.com', 'checkout.stripe.com', 'paypal.com', 'api.paypal.com',
  'api.sendgrid.com', 'api.mailgun.net', 'api.postmarkapp.com', 'api.resend.com',
  'api.twilio.com', 'hooks.slack.com', 'api.sendinblue.com',
  // 'yourapp.com/api/charge', 'yourapp.com/api/email',
];

async function installSafetyNet(page) {
  await page.route('**/*', async (route) => {
    const url = route.request().url();
    if (RISKY_HOSTS.some((h) => url.includes(h))) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, mocked: true }),
      });
    }
    return route.continue();
  });
}

module.exports = { installSafetyNet, RISKY_HOSTS };
