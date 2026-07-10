'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { MechanicalCondition, Severity } from '@snag/shared';

/**
 * The two kinds are split at creation, not runtime: the mechanical builder
 * only ever emits shapes the engine evaluates for free; the AI form is a
 * separate, clearly-labeled path that costs a model call on the user's key.
 */

type ConditionDraft =
  | { type: 'urlMatches'; value: string }
  | { type: 'clickOn'; value: string }
  | { type: 'consoleMatches'; value: string }
  | { type: 'networkMatches'; path: string; statusMin: number }
  | { type: 'formSubmitted'; value: string };

const CONDITION_LABELS: Record<ConditionDraft['type'], string> = {
  urlMatches: 'URL visited matches…',
  clickOn: 'Element clicked matches…',
  consoleMatches: 'Console/error message matches…',
  networkMatches: 'Network request failed…',
  formSubmitted: 'Form submitted matches…',
};

function toCondition(d: ConditionDraft): MechanicalCondition | null {
  switch (d.type) {
    case 'urlMatches':
      return d.value ? { urlMatches: d.value } : null;
    case 'clickOn':
      return d.value ? { clickOn: d.value } : null;
    case 'consoleMatches':
      return d.value ? { consoleMatches: d.value } : null;
    case 'networkMatches':
      return d.path ? { networkMatches: { path: d.path, statusMin: d.statusMin || 400 } } : null;
    case 'formSubmitted':
      return d.value ? { formSubmitted: d.value } : null;
  }
}

export function CustomFlagBuilder({ projectId }: { projectId: string }) {
  const router = useRouter();

  // ── Kind A — mechanical (free) ─────────────────────────────────────────────
  const [name, setName] = useState('');
  const [severity, setSeverity] = useState<Severity>('medium');
  const [within, setWithin] = useState('10s');
  const [conditions, setConditions] = useState<ConditionDraft[]>([
    { type: 'urlMatches', value: '' },
  ]);
  const [busyA, setBusyA] = useState(false);

  // ── Kind B — AI judgment (BYO-key) ────────────────────────────────────────
  const [aiName, setAiName] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiSeverity, setAiSeverity] = useState<Severity>('medium');
  const [busyB, setBusyB] = useState(false);

  async function saveMechanical(e: React.FormEvent) {
    e.preventDefault();
    const all = conditions.map(toCondition).filter((c): c is MechanicalCondition => !!c);
    if (!name.trim() || !all.length) return;
    setBusyA(true);
    await fetch(`/api/projects/${projectId}/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'custom_mechanical',
        rule: { name: name.trim(), severity, when: { all }, within: within || undefined },
      }),
    });
    setBusyA(false);
    setName('');
    setConditions([{ type: 'urlMatches', value: '' }]);
    router.refresh();
  }

  async function saveAi(e: React.FormEvent) {
    e.preventDefault();
    if (!aiName.trim() || !aiPrompt.trim()) return;
    setBusyB(true);
    await fetch(`/api/projects/${projectId}/flags`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        kind: 'custom_ai',
        aiRule: { name: aiName.trim(), severity: aiSeverity, prompt: aiPrompt.trim() },
      }),
    });
    setBusyB(false);
    setAiName('');
    setAiPrompt('');
    router.refresh();
  }

  function updateCondition(i: number, patch: Partial<ConditionDraft>) {
    setConditions((prev) =>
      prev.map((c, j) => (j === i ? ({ ...c, ...patch } as ConditionDraft) : c)),
    );
  }

  return (
    <div className="detail-grid">
      <form className="card" onSubmit={saveMechanical}>
        <h2 style={{ marginTop: 0 }}>
          Mechanical flag <span className="badge confirmed">free</span>
        </h2>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Facts the engine can check deterministically. Zero cost, always. Fires when{' '}
          <strong>all</strong> conditions occur within the window.
        </p>
        <div className="field">
          <label>Name (becomes the issue title)</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Empty address at payment"
            style={{ width: '100%' }}
          />
        </div>
        {conditions.map((c, i) => (
          <div className="row field" key={i}>
            <select
              value={c.type}
              onChange={(e) => {
                const type = e.target.value as ConditionDraft['type'];
                updateCondition(
                  i,
                  type === 'networkMatches'
                    ? ({ type, path: '', statusMin: 400 } as ConditionDraft)
                    : ({ type, value: '' } as ConditionDraft),
                );
              }}
            >
              {Object.entries(CONDITION_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            {c.type === 'networkMatches' ? (
              <>
                <input
                  placeholder="/api/pay"
                  value={c.path}
                  onChange={(e) => updateCondition(i, { path: e.target.value })}
                />
                <input
                  type="number"
                  title="Minimum status code to count as failed"
                  value={c.statusMin}
                  onChange={(e) => updateCondition(i, { statusMin: Number(e.target.value) })}
                  style={{ width: 84 }}
                />
              </>
            ) : (
              <input
                placeholder={c.type === 'clickOn' ? '#buy-button' : '/checkout'}
                value={c.value}
                onChange={(e) => updateCondition(i, { value: e.target.value })}
                style={{ flex: 1 }}
              />
            )}
            {conditions.length > 1 && (
              <button
                type="button"
                onClick={() => setConditions((prev) => prev.filter((_, j) => j !== i))}
              >
                ✕
              </button>
            )}
          </div>
        ))}
        <div className="row field">
          <button
            type="button"
            onClick={() => setConditions((prev) => [...prev, { type: 'clickOn', value: '' }])}
          >
            + condition
          </button>
          <label style={{ margin: 0 }}>within</label>
          <input value={within} onChange={(e) => setWithin(e.target.value)} style={{ width: 70 }} />
          <label style={{ margin: 0 }}>severity</label>
          <select value={severity} onChange={(e) => setSeverity(e.target.value as Severity)}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
        <button className="primary" disabled={busyA}>
          {busyA ? 'Saving…' : 'Create mechanical flag'}
        </button>
      </form>

      <form className="card" onSubmit={saveAi}>
        <h2 style={{ marginTop: 0 }}>
          AI flag <span className="badge medium">BYO-key</span>
        </h2>
        <p className="muted" style={{ fontSize: 12.5 }}>
          Judgment calls (“does this look broken?”). Each evaluation is a model call on{' '}
          <strong>your own key</strong>, only on already-flagged clips, capped daily. Requires the
          AI layer to be enabled above.
        </p>
        <div className="field">
          <label>Name</label>
          <input
            value={aiName}
            onChange={(e) => setAiName(e.target.value)}
            placeholder="Checkout screen looks broken"
            style={{ width: '100%' }}
          />
        </div>
        <div className="field">
          <label>Judgment to make</label>
          <textarea
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            placeholder="Does the checkout screen show an error state or look visually broken to a human?"
            rows={3}
            style={{ width: '100%' }}
          />
        </div>
        <div className="row field">
          <label style={{ margin: 0 }}>severity</label>
          <select value={aiSeverity} onChange={(e) => setAiSeverity(e.target.value as Severity)}>
            <option value="low">low</option>
            <option value="medium">medium</option>
            <option value="high">high</option>
          </select>
        </div>
        <button disabled={busyB}>{busyB ? 'Saving…' : 'Create AI flag'}</button>
      </form>
    </div>
  );
}
