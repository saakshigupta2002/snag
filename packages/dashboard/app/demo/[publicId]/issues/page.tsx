import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { IssueGroup } from '@snag/shared';
import { api } from '@/lib/api';
import { resolveDemo } from '@/lib/demo';
import { timeAgo } from '@/lib/format';

export const dynamic = 'force-dynamic';

const RANK = { high: 2, medium: 1, low: 0 } as const;

export default async function DemoIssues({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const project = await resolveDemo(publicId);
  if (!project) notFound();

  const all = await api<IssueGroup[]>(`/api/projects/${project.id}/issues`);
  const groups = [...all].sort((a, b) => {
    const s = RANK[b.severity] - RANK[a.severity];
    return s !== 0 ? s : a.lastSeen < b.lastSeen ? 1 : -1;
  });

  return (
    <>
      <h1>Issues</h1>
      <p className="subtitle">What looked wrong, ranked. Open one to watch the replay.</p>

      {groups.length === 0 ? (
        <div className="empty">Nothing flagged yet.</div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 104 }}>severity</th>
                <th>issue</th>
                <th style={{ width: 148 }}>detector</th>
                <th style={{ width: 92 }}>count</th>
                <th style={{ width: 104 }}>last seen</th>
                <th style={{ width: 104 }}>status</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((g) => (
                <tr key={g.groupKey} className="issue-row">
                  <td>
                    <span className={`badge ${g.severity}`}>{g.severity}</span>
                  </td>
                  <td>
                    <Link
                      href={`/demo/${publicId}/issues/${encodeURIComponent(g.groupKey)}`}
                      className="cell-title"
                    >
                      {g.title}
                    </Link>
                    {g.aiSummary && <div className="cell-sub">{g.aiSummary}</div>}
                  </td>
                  <td>
                    <span className="chip">{g.detector}</span>
                  </td>
                  <td className="muted">{g.occurrences}</td>
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
