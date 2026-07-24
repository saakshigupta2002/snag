import type { Heatmap } from '@snag/shared';
import { api } from '@/lib/api';
import { SessionReplay } from '@/components/SessionReplay';
import { HeatmapPagePicker } from '@/components/HeatmapPagePicker';

export const dynamic = 'force-dynamic';

export default async function HeatmapPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ page?: string }>;
}) {
  const { projectId } = await params;
  const page = (await searchParams).page;
  const h = await api<Heatmap>(
    `/api/projects/${projectId}/heatmap${page ? `?page=${encodeURIComponent(page)}` : ''}`,
  );

  return (
    <>
      <h1>Heatmaps</h1>
      <p className="subtitle">Where visitors actually click, aggregated per page.</p>

      {h.pages.length === 0 || !h.sessionId ? (
        <div className="empty">
          No click data yet. Heatmaps build up as visitors interact with your pages.
        </div>
      ) : (
        <div className="heatmap-layout">
          <div>
            <HeatmapPagePicker pages={h.pages} current={h.page} />
          </div>
          <div>
            <SessionReplay
              key={h.sessionId + (h.page ?? '')}
              sessionId={h.sessionId}
              heatmap={{ points: h.points }}
            />
            <div className="heat-legend">
              <span className="mono">{h.page}</span>
              <span className="ingest-sep" />
              <span>{h.points.length} clicks</span>
              <span className="ingest-sep" />
              <span>cold</span>
              <span className="heat-scale" />
              <span>hot</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
