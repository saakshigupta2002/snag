'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectSettings } from '@snag/shared';

export function ProjectSettingsForm({
  projectId,
  name,
  settings,
}: {
  projectId: string;
  name: string;
  settings: ProjectSettings;
}) {
  const [projectName, setProjectName] = useState(name);
  const [retentionDays, setRetentionDays] = useState(settings.retentionDays ?? 30);
  const [aiEnabled, setAiEnabled] = useState(settings.ai?.enabled ?? false);
  const [sampling, setSampling] = useState(settings.ai?.sampling ?? 1);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const router = useRouter();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSaved(false);
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: projectName,
        settings: {
          retentionDays: Number(retentionDays) || 30,
          ai: { enabled: aiEnabled, sampling: Number(sampling) || 1 },
        } satisfies ProjectSettings,
      }),
    });
    setBusy(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card">
      <div className="field">
        <label htmlFor="pname">Project name</label>
        <input id="pname" value={projectName} onChange={(e) => setProjectName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="retention">Session retention (days)</label>
        <input
          id="retention"
          type="number"
          min={1}
          max={365}
          value={retentionDays}
          onChange={(e) => setRetentionDays(Number(e.target.value))}
          style={{ width: 110 }}
        />
        <p className="muted" style={{ margin: '6px 0 0', fontSize: 12.5 }}>
          Raw sessions older than this are pruned automatically. Confirmed issues are kept.
        </p>
      </div>

      <h2>Optional AI layer (bring your own key)</h2>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Off by default; zero model calls unless enabled here <em>and</em> the server has{' '}
        <code>AI_PROVIDER</code> + <code>AI_API_KEY</code> set. The model only glances at
        already-flagged moments — never raw traffic — on your own key and bill.
      </p>
      <div className="field row">
        <input
          id="ai-enabled"
          type="checkbox"
          checked={aiEnabled}
          onChange={(e) => setAiEnabled(e.target.checked)}
        />
        <label htmlFor="ai-enabled" style={{ margin: 0 }}>
          Summarize flagged issues with AI
        </label>
      </div>
      {aiEnabled && (
        <div className="field">
          <label htmlFor="sampling">Sampling (fraction of flagged groups analyzed)</label>
          <input
            id="sampling"
            type="number"
            min={0.05}
            max={1}
            step={0.05}
            value={sampling}
            onChange={(e) => setSampling(Number(e.target.value))}
            style={{ width: 110 }}
          />
        </div>
      )}

      <div className="row">
        <button className="primary" disabled={busy}>
          {busy ? 'Saving…' : 'Save settings'}
        </button>
        {saved && <span className="muted">Saved.</span>}
      </div>
    </form>
  );
}
