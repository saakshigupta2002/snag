import type { FunnelDef, FunnelResult } from '@snag/shared';
import { api } from '@/lib/api';
import { FunnelManager } from '@/components/FunnelManager';

export const dynamic = 'force-dynamic';

export default async function FunnelsPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const data = await api<{ funnels: FunnelDef[]; results: FunnelResult[] }>(
    `/api/projects/${projectId}/funnels`,
  );

  return (
    <>
      <h1>Funnels</h1>
      <p className="subtitle">
        Define an ordered set of pages and see how many visitors make it through each step.
      </p>
      <FunnelManager projectId={projectId} funnels={data.funnels} results={data.results} />
    </>
  );
}
