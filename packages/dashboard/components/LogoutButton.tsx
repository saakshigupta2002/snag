'use client';

import { IconSignOut } from './icons';

export function LogoutButton() {
  return (
    <button
      className="dismiss"
      style={{ width: '100%', justifyContent: 'center' }}
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      <IconSignOut />
      Sign out
    </button>
  );
}
