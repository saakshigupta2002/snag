'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function CreateProjectForm() {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    setError(null);
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: name.trim() }),
    });
    if (res.ok) {
      const project = (await res.json()) as { id: string };
      router.push(`/p/${project.id}/settings`);
      router.refresh();
    } else {
      setError('Could not create the project.');
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit}>
      <div className="field">
        <label htmlFor="project-name">Project name</label>
        <input
          id="project-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="my-app"
          style={{ width: '100%' }}
          autoFocus
        />
      </div>
      {error && <p className="error-text">{error}</p>}
      <button className="primary" disabled={busy || !name.trim()} style={{ width: '100%' }}>
        {busy ? 'Creating…' : 'Create project'}
      </button>
    </form>
  );
}
