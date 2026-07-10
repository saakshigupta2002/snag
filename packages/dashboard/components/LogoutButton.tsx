'use client';

export function LogoutButton() {
  return (
    <button
      className="dismiss"
      style={{ width: '100%' }}
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      Sign out
    </button>
  );
}
