'use client';

export function LogoutButton() {
  return (
    <button
      className="dismiss mono"
      style={{ width: '100%', justifyContent: 'center', fontSize: 12.5 }}
      onClick={async () => {
        await fetch('/api/logout', { method: 'POST' });
        window.location.href = '/login';
      }}
    >
      sign out
    </button>
  );
}
