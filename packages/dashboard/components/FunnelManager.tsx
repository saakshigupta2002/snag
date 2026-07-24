'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FunnelDef, FunnelResult } from '@snag/shared';
import { useToast } from './Toast';

export function FunnelManager({
  projectId,
  funnels,
  results,
}: {
  projectId: string;
  funnels: FunnelDef[];
  results: FunnelResult[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [stepsText, setStepsText] = useState('');
  const [busy, setBusy] = useState(false);

  const save = async (next: FunnelDef[]) => {
    setBusy(true);
    try {
      const r = await fetch(`/api/projects/${projectId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings: { funnels: next } }),
      });
      if (!r.ok) throw new Error();
      router.refresh();
    } catch {
      toast('Could not save funnel — try again', 'error');
    } finally {
      setBusy(false);
    }
  };

  const add = () => {
    const steps = stepsText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);
    if (!name.trim() || steps.length < 2) {
      toast('Give it a name and at least two steps', 'error');
      return;
    }
    const id =
      typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `f-${Date.now()}`;
    void save([...funnels, { id, name: name.trim(), steps }]);
    setName('');
    setStepsText('');
  };

  const remove = (id: string) => void save(funnels.filter((f) => f.id !== id));

  return (
    <>
      {results.length === 0 ? (
        <div className="empty" style={{ marginBottom: 18 }}>
          No funnels yet. Define an ordered set of pages below to see where people drop off.
        </div>
      ) : (
        results.map((f) => {
          const entered = f.entered || 1;
          return (
            <div className="card" key={f.id}>
              <div className="section-head">
                <h2 style={{ margin: 0 }}>{f.name}</h2>
                <button className="mini" title="Delete funnel" onClick={() => remove(f.id)} disabled={busy}>
                  ✕
                </button>
              </div>
              <div className="funnel">
                {f.steps.map((s, i) => {
                  const pct = (s.count / entered) * 100;
                  const prev = i > 0 ? f.steps[i - 1]!.count : s.count;
                  const drop = prev > 0 ? Math.round(((prev - s.count) / prev) * 100) : 0;
                  return (
                    <div className="funnel-step" key={i}>
                      <div className="funnel-head">
                        <span className="funnel-idx mono">{i + 1}</span>
                        <span className="funnel-path mono">{s.step}</span>
                        <span className="funnel-count">
                          {s.count} · {Math.round(pct)}%
                        </span>
                      </div>
                      <div className="funnel-bar">
                        <div className="funnel-fill" style={{ width: `${pct}%` }} />
                      </div>
                      {i > 0 && drop > 0 && (
                        <div className="funnel-drop muted">−{drop}% dropped from previous step</div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}

      <div className="card">
        <h3>New funnel</h3>
        <div className="field">
          <label>Name</label>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Checkout flow" />
        </div>
        <div className="field">
          <label>Steps — one page path per line, in order</label>
          <textarea
            rows={4}
            className="mono"
            value={stepsText}
            onChange={(e) => setStepsText(e.target.value)}
            placeholder={'/\n/pricing\n/checkout'}
            style={{ width: '100%', resize: 'vertical' }}
          />
        </div>
        <button className="primary" onClick={add} disabled={busy}>
          Add funnel
        </button>
      </div>
    </>
  );
}
