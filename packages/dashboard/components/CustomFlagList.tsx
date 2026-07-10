'use client';

import { useRouter } from 'next/navigation';
import type { FlagRule } from '@snag/shared';

export function CustomFlagList({ projectId, rules }: { projectId: string; rules: FlagRule[] }) {
  const router = useRouter();
  if (!rules.length) return null;

  return (
    <table>
      <thead>
        <tr>
          <th>Custom flag</th>
          <th>Kind</th>
          <th>Definition</th>
          <th style={{ width: 80 }}></th>
        </tr>
      </thead>
      <tbody>
        {rules.map((r) => {
          const def = (r.params as { rule?: { name?: string } }).rule;
          return (
            <tr key={r.id}>
              <td>{def?.name ?? r.detector}</td>
              <td>
                <span className={`badge ${r.kind === 'custom_ai' ? 'medium' : 'confirmed'}`}>
                  {r.kind === 'custom_ai' ? 'AI (BYO-key)' : 'mechanical (free)'}
                </span>
              </td>
              <td>
                <code style={{ fontSize: 11.5 }}>{JSON.stringify(def).slice(0, 110)}…</code>
              </td>
              <td>
                <button
                  className="danger"
                  onClick={async () => {
                    await fetch(`/api/projects/${projectId}/flags/rule/${r.id}`, {
                      method: 'DELETE',
                    });
                    router.refresh();
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
