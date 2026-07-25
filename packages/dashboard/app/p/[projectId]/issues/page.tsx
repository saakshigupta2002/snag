import type { IssueGroup } from '@snag/shared';
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
  const highOpen = open.filter((g) => g.severity === 'high').length;
  const confirmed = all.filter((g) => g.status === 'confirmed').length;

  return (
    <>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 9 }}>Issues</h1>
          <div className="summary-strip">
            <span>
              <b>{open.length}</b> open
            </span>
            <span className="ss-sep" />
            <span className={highOpen ? 'ss-alert' : ''}>
              <b>{highOpen}</b> high priority
            </span>
            <span className="ss-sep" />
            <span>
              <b>{confirmed}</b> confirmed
            </span>
            <span className="ss-sep" />
            <span>
              <b>{all.length}</b> total
            </span>
          </div>
        </div>
      </div>
      <p className="subtitle">What looks wrong, ranked. Open one, watch the clip, make the call.</p>

      <IssuesTable projectId={projectId} groups={all} />
    </>
  );
}
