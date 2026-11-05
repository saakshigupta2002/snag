'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toast';

/**
 * Per-session owner actions: star a recording (kept past retention) or delete
 * one you do not want. Optimistic, with a confirm on delete.
 */
export function SessionActions({
  sessionId,
  favorite,
}: {
  sessionId: string;
  favorite?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [fav, setFav] = useState(!!favorite);
  const [busy, setBusy] = useState(false);
  const [gone, setGone] = useState(false);
  const enc = encodeURIComponent(sessionId);

  const toggleFav = async () => {
    const next = !fav;
    setFav(next); // optimistic
    try {
      const r = await fetch(`/api/sessions/${enc}/favorite`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ favorite: next }),
      });
      if (!r.ok) throw new Error();
      toast(next ? 'Favorited: kept past retention' : 'Removed from favorites', next ? 'ok' : 'info');
      router.refresh();
    } catch {
      setFav(!next);
      toast('Could not update favorite', 'error');
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this recording? This cannot be undone.')) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/sessions/${enc}`, { method: 'DELETE' });
      if (!r.ok) throw new Error();
      setGone(true);
      toast('Recording deleted', 'info');
      router.refresh();
    } catch {
      setBusy(false);
      toast('Could not delete. Try again', 'error');
    }
  };

  if (gone) return <span className="muted mono" style={{ fontSize: 11.5 }}>deleted</span>;

  return (
    <span className="session-actions">
      <button
        className={`sa-btn sa-star ${fav ? 'on' : ''}`}
        onClick={toggleFav}
        disabled={busy}
        title={fav ? 'Favorited (kept past retention)' : 'Favorite this recording'}
        aria-label="Favorite"
      >
        {fav ? '★' : '☆'}
      </button>
      <button
        className="sa-btn sa-del"
        onClick={remove}
        disabled={busy}
        title="Delete this recording"
        aria-label="Delete"
      >
        ✕
      </button>
    </span>
  );
}
