'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectSettings } from '@snag/shared';
import { useToast } from './Toast';

export function AlertsForm({
  projectId,
  settings,
}: {
  projectId: string;
  settings: ProjectSettings;
}) {
  const [webhookUrl, setWebhookUrl] = useState(settings.alerts?.webhookUrl ?? '');
  const [minSeverity, setMinSeverity] = useState(settings.alerts?.minSeverity ?? 'high');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        settings: { alerts: { webhookUrl: webhookUrl.trim(), minSeverity } },
      }),
    });
    setBusy(false);
    toast(webhookUrl.trim() ? 'Alerts saved' : 'Alerts disabled', 'ok');
    router.refresh();
  }

  return (
    <form onSubmit={save} className="card">
      <h2 style={{ marginTop: 0 }}>Alerts</h2>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Post to a webhook when a <strong>new</strong> issue appears. Works with Slack incoming
        webhooks (reads the message) or any endpoint (gets structured JSON). Leave blank to disable.
      </p>
      <div className="field">
        <label htmlFor="webhook">Webhook URL</label>
        <input
          id="webhook"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          placeholder="https://hooks.slack.com/services/…"
          className="mono"
          style={{ width: '100%' }}
        />
      </div>
      <div className="field">
        <label htmlFor="minsev">Only alert at or above</label>
        <select id="minsev" value={minSeverity} onChange={(e) => setMinSeverity(e.target.value as 'low' | 'medium' | 'high')}>
          <option value="high">high</option>
          <option value="medium">medium</option>
          <option value="low">low</option>
        </select>
      </div>
      <button className="primary" disabled={busy}>
        {busy ? 'Saving…' : 'Save alerts'}
      </button>
    </form>
  );
}
