'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { DetectorStat } from '@snag/shared';
import { useToast } from './Toast';

export interface BuiltinFlag {
  detector: string;
  tier: 1 | 2;
  describe: string;
  enabled: boolean;
  params: Record<string, unknown>;
  overridden: boolean;
}

type ParamVal = number | boolean | string;

function paramType(v: unknown): 'number' | 'boolean' | 'list' {
  if (typeof v === 'number') return 'number';
  if (typeof v === 'boolean') return 'boolean';
  return 'list';
}

function DetectorCard({
  projectId,
  flag,
  stat,
}: {
  projectId: string;
  flag: BuiltinFlag;
  stat?: DetectorStat;
}) {
  const [enabled, setEnabled] = useState(flag.enabled);
  const [params, setParams] = useState<Record<string, ParamVal>>(() => {
    const out: Record<string, ParamVal> = {};
    for (const [k, v] of Object.entries(flag.params)) {
      out[k] = paramType(v) === 'list' ? (Array.isArray(v) ? v.join(', ') : String(v)) : (v as ParamVal);
    }
    return out;
  });
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function save(nextEnabled = enabled) {
    setBusy(true);
    const outParams: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(params)) {
      const t = paramType(flag.params[k]);
      if (t === 'number') outParams[k] = Number(v) || 0;
      else if (t === 'boolean') outParams[k] = !!v;
      else
        outParams[k] = String(v)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
    }
    await fetch(`/api/projects/${projectId}/flags/${flag.detector}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled: nextEnabled, params: outParams }),
    });
    setBusy(false);
    setDirty(false);
    toast(`${flag.detector} saved`, 'ok');
    router.refresh();
  }

  return (
    <div className={`det-card ${enabled ? '' : 'off'}`}>
      <div className="det-head">
        <label className="switch" title={enabled ? 'On' : 'Off'}>
          <input
            type="checkbox"
            checked={enabled}
            disabled={busy}
            onChange={(e) => {
              setEnabled(e.target.checked);
              void save(e.target.checked);
            }}
          />
          <span className="track" />
        </label>
        <div style={{ flex: 1 }}>
          <div className="row" style={{ gap: 8 }}>
            <span className="chip">{flag.detector}</span>
            {flag.tier === 2 && <span className="det-tier mono">tier 2</span>}
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginTop: 4 }}>
            {flag.describe}
          </div>
        </div>
        {stat && (
          <div className="det-stats mono">
            <span title="times fired">{stat.fired} fired</span>
            {stat.confirmed > 0 && <span className="ok">{stat.confirmed} real</span>}
            {stat.dismissed > 0 && <span className="dim">{stat.dismissed} noise</span>}
          </div>
        )}
      </div>
      {enabled && Object.keys(params).length > 0 && (
        <div className="det-params">
          {Object.entries(params).map(([k, v]) => {
            const t = paramType(flag.params[k]);
            return (
              <div className="det-param" key={k}>
                <label htmlFor={`${flag.detector}-${k}`}>{k}</label>
                {t === 'boolean' ? (
                  <input
                    id={`${flag.detector}-${k}`}
                    type="checkbox"
                    checked={!!v}
                    onChange={(e) => {
                      setParams((p) => ({ ...p, [k]: e.target.checked }));
                      setDirty(true);
                    }}
                  />
                ) : (
                  <input
                    id={`${flag.detector}-${k}`}
                    type={t === 'number' ? 'number' : 'text'}
                    className="mono"
                    value={String(v)}
                    onChange={(e) => {
                      setParams((p) => ({ ...p, [k]: e.target.value }));
                      setDirty(true);
                    }}
                  />
                )}
              </div>
            );
          })}
          {dirty && (
            <button className="primary" disabled={busy} onClick={() => save()}>
              Save
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function DetectorTuner({
  projectId,
  flags,
  stats,
}: {
  projectId: string;
  flags: BuiltinFlag[];
  stats: DetectorStat[];
}) {
  const statMap = new Map(stats.map((s) => [s.detector, s]));
  return (
    <div className="det-list">
      {flags.map((f) => (
        <DetectorCard key={f.detector} projectId={projectId} flag={f} stat={statMap.get(f.detector)} />
      ))}
    </div>
  );
}
