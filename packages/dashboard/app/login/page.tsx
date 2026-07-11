'use client';

import { useState } from 'react';
import { IconLogo } from '@/components/icons';

export default function LoginPage() {
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      window.location.href = '/';
    } else {
      setError('Wrong password.');
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="logo" style={{ padding: 0, marginBottom: 22 }}>
          <span className="logo-mark">
            <IconLogo />
          </span>
          Snag
        </div>
        <div className="field">
          <label htmlFor="password">Dashboard password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ width: '100%' }}
            autoFocus
          />
        </div>
        {error && <p className="error-text">{error}</p>}
        <button className="primary" style={{ width: '100%' }} disabled={busy}>
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
