import Link from 'next/link';
import type { IssueGroup } from '@snag/shared';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS_FILTERS = ['open', 'confirmed', 'dismissed', 'all'] as const;
const SEVERITY_FILTERS = ['all', 'high', 'medium', 'low'] as const;

export default async function IssuesPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  const { projectId } = await params;
  const q = await searchParams;
  const status = q.status ?? 'open';
  const severity = q.severity ?? 'all';

  const query = new URLSearchParams();
  if (status !== 'all') query.set('status', status);
  if (severity !== 'all') query.set('severity', severity);
  const groups = await api<IssueGroup[]>(
    `/api/projects/${projectId}/issues${query.size ? `?${query}` : ''}`,
  );

  const link = (s: string, sev: string) => {
    const p = new URLSearchParams();
    if (s !== 'open') p.set('status', s);
    if (sev !== 'all') p.set('severity', sev);
    return `/p/${projectId}/issues${p.size ? `?${p}` : ''}`;
  };

  return (
    <>
      <h1>Issues</h1>
      <p className="subtitle">
        What looks wrong, ranked. Open one, watch the clip, and make the call.
      </p>

      <div className="filters">
        {STATUS_FILTERS.map((s) => (
          <Link key={s} href={link(s, severity)} className={s === status ? 'active' : ''}>
            {s}
          </Link>
        ))}
        <span style={{ width: 12 }} />
        {SEVERITY_FILTERS.map((sev) => (
          <Link key={sev} href={link(status, sev)} className={sev === severity ? 'active' : ''}>
            {sev === 'all' ? 'any severity' : sev}
          </Link>
        ))}
      </div>

      {groups.length === 0 ? (
        <div className="empty">
          <p>
            <strong>Nothing flagged{status !== 'all' ? ` (${status})` : ''}.</strong>
          </p>
          <p>
            Either your app is behaving, or no sessions have been recorded yet. Install the SDK
            from <Link href={`/p/${projectId}/settings`}>Settings</Link> and click around your app.
          </p>
        </div>
      ) : (
        <table>
          <thead>
            <tr>
              <th style={{ width: 90 }}>Severity</th>
              <th>Issue</th>
              <th style={{ width: 140 }}>Detector</th>
              <th style={{ width: 110 }}>Occurrences</th>
              <th style={{ width: 90 }}>Sessions</th>
              <th style={{ width: 110 }}>Last seen</th>
              <th style={{ width: 100 }}>Status</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.groupKey}>
                <td>
                  <span className={`badge ${g.severity}`}>{g.severity}</span>
                </td>
                <td>
                  <Link href={`/p/${projectId}/issues/${encodeURIComponent(g.groupKey)}`}>
                    {g.title}
                  </Link>
                  {g.aiSummary && (
                    <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>
                      {g.aiSummary}
                    </div>
                  )}
                </td>
                <td>
                  <span className="chip">{g.detector}</span>
                </td>
                <td>{g.occurrences}</td>
                <td>{g.sessionCount}</td>
                <td className="muted">{timeAgo(g.lastSeen)}</td>
                <td>
                  <span className={`badge ${g.status}`}>{g.status}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
