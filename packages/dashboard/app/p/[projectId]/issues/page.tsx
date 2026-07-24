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

      <div className="issue-summary">
        <div className="s-item">
          <span className="s-val">{open.length}</span>
          <span className="s-label">open</span>
        </div>
        <span className="s-div" />
        <div className="s-item">
          <span className="dot high" />
          <span className="s-val">{count('high')}</span>
          <span className="s-label">high</span>
        </div>
        <div className="s-item">
          <span className="dot medium" />
          <span className="s-val">{count('medium')}</span>
          <span className="s-label">medium</span>
        </div>
        <div className="s-item">
          <span className="dot low" />
          <span className="s-val">{count('low')}</span>
          <span className="s-label">low</span>
        </div>
      </div>

      <IssuesTable projectId={projectId} groups={all} />
    </>
  );
}
