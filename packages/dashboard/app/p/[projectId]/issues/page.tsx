import Link from 'next/link';
import type { IssueGroup, Severity } from '@snag/shared';
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

  // Fetch the full set once: stat tiles reflect all open issues regardless of
  // the current filter; the table below is filtered in-page.
  const all = await api<IssueGroup[]>(`/api/projects/${projectId}/issues`);
  const open = all.filter((g) => g.status === 'open');
  const count = (s: Severity) => open.filter((g) => g.severity === s).length;

  let groups = all;
  if (status !== 'all') groups = groups.filter((g) => g.status === status);
  if (severity !== 'all') groups = groups.filter((g) => g.severity === severity);
  groups = groups.sort((a, b) => {
    const rank = { high: 2, medium: 1, low: 0 };
    const s = rank[b.severity] - rank[a.severity];
    return s !== 0 ? s : (a.lastSeen < b.lastSeen ? 1 : -1);
  });

  const link = (s: string, sev: string) => {
    const p = new URLSearchParams();
    if (s !== 'open') p.set('status', s);
    if (sev !== 'all') p.set('severity', sev);
    return `/p/${projectId}/issues${p.size ? `?${p}` : ''}`;
  };

  return (
    <>
      <h1>Issues</h1>
      <p className="subtitle">What looks wrong, ranked. Open one, watch the clip, make the call.</p>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">
            <span className="dot accent" />
            Open issues
          </div>
          <div className="stat-value">{open.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot high" />
            High
          </div>
          <div className="stat-value" style={{ color: 'var(--high)' }}>
            {count('high')}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot medium" />
            Medium
          </div>
          <div className="stat-value" style={{ color: 'var(--medium)' }}>
            {count('medium')}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot low" />
            Low
          </div>
          <div className="stat-value">{count('low')}</div>
        </div>
      </div>

      <div className="filters">
        {STATUS_FILTERS.map((s) => (
          <Link key={s} href={link(s, severity)} className={s === status ? 'active' : ''}>
            {s}
          </Link>
        ))}
        <span className="sep" />
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
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 104 }}>Severity</th>
                <th>Issue</th>
                <th style={{ width: 150 }}>Detector</th>
                <th style={{ width: 100 }}>Count</th>
                <th style={{ width: 110 }}>Last seen</th>
                <th style={{ width: 104 }}>Status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.groupKey}>
                  <td>
                    <span className={`badge ${g.severity}`}>{g.severity}</span>
                  </td>
                  <td>
                    <Link
                      href={`/p/${projectId}/issues/${encodeURIComponent(g.groupKey)}`}
                      className="cell-title"
                    >
                      {g.title}
                    </Link>
                    {g.aiSummary && <div className="cell-sub">{g.aiSummary}</div>}
                  </td>
                  <td>
                    <span className="chip">{g.detector}</span>
                  </td>
                  <td className="muted">
                    {g.occurrences}
                    {g.sessionCount > 1 ? ` · ${g.sessionCount} sessions` : ''}
                  </td>
                  <td className="muted">{timeAgo(g.lastSeen)}</td>
                  <td>
                    <span className={`badge ${g.status}`}>{g.status}</span>
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
