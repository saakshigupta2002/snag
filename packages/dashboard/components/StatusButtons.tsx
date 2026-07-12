'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useToast } from './Toast';

/** The human judgment: Snag points, the person decides. */
export function StatusButtons({
  projectId,
  groupKey,
  status,
}: {
  projectId: string;
  groupKey: string;
  status: string;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const router = useRouter();
  const toast = useToast();

  async function set(next: 'confirmed' | 'dismissed' | 'open') {
    setBusy(true);
    await fetch(`/api/projects/${projectId}/issues/${encodeURIComponent(groupKey)}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next, note: note || undefined }),
    });
    setBusy(false);
    setNote('');
    toast(
      next === 'confirmed' ? 'Confirmed — real bug' : next === 'dismissed' ? 'Dismissed' : 'Reopened',
      next === 'dismissed' ? 'info' : 'ok',
    );
    router.refresh();
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Your call</h2>
      <label htmlFor="issue-note">Note (optional)</label>
      <input
        id="issue-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="e.g. broken since the checkout redesign"
        style={{ width: '100%', marginBottom: 12 }}
      />
      <div className="row">
        <button className="confirm" disabled={busy || status === 'confirmed'} onClick={() => set('confirmed')}>
          ✓ Confirm — real bug
        </button>
        <button className="dismiss" disabled={busy || status === 'dismissed'} onClick={() => set('dismissed')}>
          Dismiss — normal
        </button>
        {status !== 'open' && (
          <button disabled={busy} onClick={() => set('open')}>
            Reopen
          </button>
        )}
      </div>
    </div>
  );
}
