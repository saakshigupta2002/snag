import type { IssueGroup, Severity } from '@snag/shared';
import { api } from '@/lib/api';
import { IssuesTable } from '@/components/IssuesTable';

export const dynamic = 'force-dynamic';

export default async function IssuesPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const all = await api<IssueGroup[]>(`/api/projects/${projectId}/issues`);
  const open = all.filter((g) => g.status === 'open');
  const count = (s: Severity) => open.filter((g) => g.severity === s).length;

  return (
    <>
      <h1>Issues</h1>
      <p className="subtitle">What looks wrong, ranked. Open one, watch the clip, make the call.</p>

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">
            <span className="dot accent" />
            open issues
          </div>
          <div className="stat-value">{open.length}</div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot high" />
            high
          </div>
          <div className="stat-value" style={{ color: 'var(--high)' }}>
            {count('high')}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot medium" />
            medium
          </div>
          <div className="stat-value" style={{ color: 'var(--medium)' }}>
            {count('medium')}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot low" />
            low
          </div>
          <div className="stat-value">{count('low')}</div>
        </div>
      </div>

      <IssuesTable projectId={projectId} groups={all} />
    </>
  );
}
