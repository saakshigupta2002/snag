'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ProjectSettings } from '@snag/shared';
import { useToast } from './Toast';
import { CopyButton } from './CopyButton';

/** Random URL-safe slug, ~132 bits — not guessable, no server round-trip. */
function newPublicId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function ShareForm({
  projectId,
  settings,
}: {
  projectId: string;
  settings: ProjectSettings;
}) {
  const [enabled, setEnabled] = useState(!!settings.share?.enabled);
  const [publicId, setPublicId] = useState(settings.share?.publicId ?? '');
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  const toast = useToast();

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const link = publicId ? `${origin}/demo/${publicId}` : '';

  async function persist(share: { enabled: boolean; publicId?: string }) {
    setBusy(true);
    await fetch(`/api/projects/${projectId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ settings: { share } }),
    });
    setBusy(false);
    router.refresh();
  }

  async function toggle() {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      const id = publicId || newPublicId();
      setPublicId(id);
      await persist({ enabled: true, publicId: id });
      toast('Demo link is live', 'ok');
    } else {
      await persist({ enabled: false, publicId });
      toast('Demo link turned off', 'ok');
    }
  }

  async function regenerate() {
    const id = newPublicId();
    setPublicId(id);
    await persist({ enabled: true, publicId: id });
    toast('New link generated — the old one no longer works', 'ok');
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Share a read-only demo</h2>
      <p className="muted" style={{ fontSize: 12.5 }}>
        Turn on a public link that shows <strong>only this project</strong> — overview, issues, and
        session replays — with no login and no way to change anything. Your API token and database
        stay server-side. Anyone with the link can look; nobody can touch your other projects.
      </p>

      <label className="switch-row">
        <input type="checkbox" checked={enabled} onChange={toggle} disabled={busy} />
        <span>{enabled ? 'Demo link is on' : 'Demo link is off'}</span>
      </label>

      {enabled && publicId && (
        <>
          <div className="field" style={{ marginTop: 12 }}>
            <label htmlFor="demo-link">Shareable link</label>
            <div className="row">
              <input
                id="demo-link"
                readOnly
                value={link}
                className="mono"
                style={{ width: '100%' }}
                onFocus={(e) => e.currentTarget.select()}
              />
              <CopyButton text={link} />
            </div>
          </div>
          <button className="ghost" onClick={regenerate} disabled={busy} style={{ marginTop: 4 }}>
            Generate new link
          </button>
          <p className="muted" style={{ fontSize: 12, marginTop: 8 }}>
            Send this to recruiters or teammates. Regenerating instantly kills the old link.
          </p>
        </>
      )}
    </div>
  );
}
