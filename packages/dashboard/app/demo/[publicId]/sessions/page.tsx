import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Session } from '@snag/shared';
import { api } from '@/lib/api';
import { resolveDemo } from '@/lib/demo';
import { duration, pathOfUrl, timeAgo } from '@/lib/format';

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

  return (
    <>
      <h1>Sessions</h1>
      <p className="subtitle">Recorded sessions, newest first. Open one to watch the replay.</p>

      {sessions.length === 0 ? (
        <div className="empty">No sessions recorded yet.</div>
      ) : (
        <div className="table-wrap">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Entry page</th>
                <th style={{ width: 92 }}>Duration</th>
                <th style={{ width: 78 }}>Events</th>
                <th style={{ width: 120 }}>Device</th>
                <th style={{ width: 120 }}>Browser</th>
                <th style={{ width: 96 }}>Status</th>
                <th style={{ width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{timeAgo(s.startedAt)}</td>
                  <td className="mono">{pathOfUrl(s.urlFirst)}</td>
                  <td className="mono num">{duration(s.startedAt, s.endedAt)}</td>
                  <td className="mono num">{s.eventCount}</td>
                  <td className="muted">{s.device ?? '—'}</td>
                  <td className="muted">{s.browser ?? '—'}</td>
                  <td>
                    <span className={`st ${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    <Link className="watch-link" href={`/demo/${publicId}/sessions/${encodeURIComponent(s.id)}`}>
                      watch →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
