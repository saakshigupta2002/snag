'use client';

export function LogoutButton() {
  return (
    <button
      className="dismiss"
      style={{ width: '100%', justifyContent: 'center', fontSize: 13 }}
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      sign out
    </button>
  );
}
