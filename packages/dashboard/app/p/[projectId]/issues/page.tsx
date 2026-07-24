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

  return (
    <>
      <h1>Issues</h1>
      <p className="subtitle">What looks wrong, ranked. Open one, watch the clip, make the call.</p>

      <IssuesTable projectId={projectId} groups={all} />
    </>
  );
}
