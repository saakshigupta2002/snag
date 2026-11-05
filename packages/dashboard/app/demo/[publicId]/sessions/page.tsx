import { notFound } from 'next/navigation';
import type { Session } from '@snag/shared';
import { api } from '@/lib/api';
import { resolveDemo } from '@/lib/demo';
import { SessionsTable, isLowSignal, byActivity } from '@/components/SessionsTable';

export const dynamic = 'force-dynamic';

export default async function DemoSessions({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  const project = await resolveDemo(publicId);
  if (!project) notFound();

  const sessions = await api<Session[]>(`/api/projects/${project.id}/sessions`);
  const active = sessions.filter((s) => !isLowSignal(s)).sort(byActivity);
  const lowSignal = sessions.filter(isLowSignal).sort(byActivity);
  const basePath = `/demo/${publicId}/sessions`;

  return (
    <>
      <h1>Sessions</h1>
      <p className="subtitle">Sessions with real activity first. Open one to watch the replay.</p>

      {sessions.length === 0 ? (
        <div className="empty">No sessions recorded yet.</div>
      ) : (
        <>
          {active.length > 0 ? (
            <SessionsTable sessions={active} basePath={basePath} />
          ) : (
            <div className="empty">No sessions with activity yet. Only idle visits (below).</div>
          )}

          {lowSignal.length > 0 && (
            <details className="lowsignal">
              <summary>
                <span className="ls-caret" aria-hidden>
                  ▸
                </span>
                <b>{lowSignal.length}</b> low-signal session{lowSignal.length === 1 ? '' : 's'}: no clicks or
                interactions
              </summary>
              <SessionsTable sessions={lowSignal} basePath={basePath} />
            </details>
          )}
        </>
      )}
    </>
  );
}
