/* Demo app wiring: intentionally broken interactions + Snag SDK init. */
(function () {
  var params = new URLSearchParams(location.search);
  var key = params.get('key');
  var endpoint = params.get('endpoint') || 'http://localhost:8787';
  var status = document.getElementById('status');

  if (key && window.Snag) {
    var handle = window.Snag.init({ projectKey: key, endpoint: endpoint });
    document.getElementById('setup-warning').style.display = 'none';
    status.textContent =
      'Recording session ' + (handle.sessionId || '').slice(0, 8) + '… → ' + endpoint;
  }

  // 1 — dead button: no handler at all (that's the bug).

  // 2 — rage-click bait: swallows clicks silently.
  document.getElementById('rage-button').addEventListener('click', function (e) {
    e.preventDefault(); // consume the click, change nothing
  });

  // 3 — silent crash.
  document.getElementById('crash-button').addEventListener('click', function () {
    setTimeout(function () {
      throw new TypeError('discount.apply is not a function');
    }, 0);
  });

  // 4 — failing API call, error swallowed.
  document.getElementById('api-button').addEventListener('click', function () {
    fetch(endpoint.replace(/\/$/, '') + '/definitely-not-a-real-route', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ order: 42, card: '4242 4242 4242 4242' }),
    }).catch(function () {});
  });

  // 5 — form: submitting "works", but you're meant to abandon it.
  document.getElementById('signup-form').addEventListener('submit', function (e) {
    e.preventDefault();
    status.textContent = 'Form submitted (this one actually works).';
  });

  // Fake SPA navigation so U-turns and thrash are detectable.
  document.querySelectorAll('[data-nav]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      history.pushState({}, '', a.getAttribute('data-nav') + location.search);
    });
  });
})();
