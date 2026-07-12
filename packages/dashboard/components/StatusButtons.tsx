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
  const [optimistic, setOptimistic] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const router = useRouter();
  const toast = useToast();
  const cur = optimistic ?? status;

  function set(next: 'confirmed' | 'dismissed' | 'open') {
    const noteVal = note || undefined;
    setOptimistic(next);
    setNote('');
    toast(
      next === 'confirmed' ? 'Confirmed — real bug' : next === 'dismissed' ? 'Dismissed' : 'Reopened',
      next === 'dismissed' ? 'info' : 'ok',
    );
    fetch(`/api/projects/${projectId}/issues/${encodeURIComponent(groupKey)}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: next, note: noteVal }),
    })
      .then((r) => {
        if (!r.ok) throw new Error();
        router.refresh();
      })
      .catch(() => {
        setOptimistic(null);
        toast('Could not update — try again', 'error');
      });
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
        <button className="confirm" disabled={cur === 'confirmed'} onClick={() => set('confirmed')}>
          ✓ Confirm — real bug
        </button>
        <button className="dismiss" disabled={cur === 'dismissed'} onClick={() => set('dismissed')}>
          Dismiss — normal
        </button>
        {cur !== 'open' && <button onClick={() => set('open')}>Reopen</button>}
      </div>
    </div>
  );
}
