import Link from 'next/link';
import type { Session } from '@snag/shared';
import { api } from '@/lib/api';
import { duration, pathOfUrl, timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const sessions = await api<Session[]>(`/api/projects/${projectId}/sessions`);

  return (
    <>
      <h1>Sessions</h1>
      <p className="subtitle">Recorded sessions, newest first. Issues link to the exact moment.</p>

      {sessions.length === 0 ? (
        <div className="empty">
          No sessions yet. Install the SDK from{' '}
          <Link href={`/p/${projectId}/settings`}>Settings</Link> and use your app — sessions show
          up here within seconds.
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Started</th>
              <th>Entry page</th>
              <th>Duration</th>
              <th>Events</th>
              <th>Device</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td>{timeAgo(s.startedAt)}</td>
                <td className="mono">{pathOfUrl(s.urlFirst)}</td>
                <td>{duration(s.startedAt, s.endedAt)}</td>
                <td>{s.eventCount}</td>
                <td className="muted">{s.device ?? '—'}</td>
                <td>
                  <span className="chip">{s.status}</span>
                </td>
                <td>
                  <Link href={`/p/${projectId}/sessions/${encodeURIComponent(s.id)}`}>watch</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
