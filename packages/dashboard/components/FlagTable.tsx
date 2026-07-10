'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export interface BuiltinFlag {
  detector: string;
  tier: 1 | 2;
  describe: string;
  enabled: boolean;
  params: Record<string, unknown>;
  overridden: boolean;
}

function FlagRow({ projectId, flag }: { projectId: string; flag: BuiltinFlag }) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [paramsText, setParamsText] = useState(JSON.stringify(flag.params));
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const router = useRouter();

  async function save(nextEnabled = enabled) {
    let params: Record<string, unknown>;
    try {
      params = JSON.parse(paramsText) as Record<string, unknown>;
      setError(false);
    } catch {
      setError(true);
      return;
    }
    setBusy(true);
    await fetch(`/api/projects/${projectId}/flags/${flag.detector}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled, params }),
    });
    setBusy(false);
    setDirty(false);
    router.refresh();
  }

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          checked={enabled}
          disabled={busy}
          onChange={(e) => {
            setEnabled(e.target.checked);
            void save(e.target.checked);
          }}
          aria-label={`Toggle ${flag.detector}`}
        />
      </td>
      <td>
        <span className="chip">{flag.detector}</span>
        {flag.tier === 2 && (
          <span className="muted" style={{ fontSize: 11, marginLeft: 6 }}>
            tier 2
          </span>
        )}
        <div className="muted" style={{ fontSize: 12.5 }}>
          {flag.describe}
        </div>
      </td>
      <td style={{ width: '38%' }}>
        <input
          className="mono"
          style={{ width: '100%', fontSize: 12, borderColor: error ? 'var(--red)' : undefined }}
          value={paramsText}
          onChange={(e) => {
            setParamsText(e.target.value);
            setDirty(true);
          }}
          aria-label={`${flag.detector} params`}
        />
      </td>
      <td style={{ width: 90 }}>
        {dirty && (
          <button disabled={busy} onClick={() => save()}>
            Save
          </button>
        )}
      </td>
    </tr>
  );
}

export function FlagTable({ projectId, flags }: { projectId: string; flags: BuiltinFlag[] }) {
  return (
    <table>
      <thead>
        <tr>
          <th style={{ width: 40 }}>On</th>
          <th>Detector</th>
          <th>Thresholds (every value is tunable)</th>
          <th></th>
        </tr>
      </thead>
      <tbody>
        {flags.map((f) => (
          <FlagRow key={f.detector} projectId={projectId} flag={f} />
        ))}
      </tbody>
    </table>
  );
}
