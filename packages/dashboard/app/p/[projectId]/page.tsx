import Link from 'next/link';
import type { Analytics, Project } from '@snag/shared';
import { apiCached } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { AnalyticsView } from '@/components/AnalyticsView';
import { RangeSelector } from '@/components/RangeSelector';
import { FilterBar } from '@/components/FilterBar';
import { LiveRefresh } from '@/components/LiveRefresh';

// Read-only analytics: cache briefly so navigations don't recompute every time.
export const revalidate = 15;

const FILTER_DIMS = ['device', 'browser', 'os', 'country', 'channel'] as const;

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;
  const days = Math.min(Math.max(Number(sp.days) || 14, 1), 90);
  const filters: Record<string, string> = {};
  const qs = new URLSearchParams({ days: String(days) });
  for (const dim of FILTER_DIMS) {
    if (sp[dim]) {
      filters[dim] = sp[dim]!;
      qs.set(dim, sp[dim]!);
    }
  }
  const [project, a] = await Promise.all([
    apiCached<Project>(`/api/projects/${projectId}`),
    apiCached<Analytics>(`/api/projects/${projectId}/analytics?${qs.toString()}`),
  ]);
  const options: Record<string, string[]> = {
    device: a.device.map((r) => r.key),
    browser: a.browser.map((r) => r.key),
    os: a.os.map((r) => r.key),
    country: a.countries.map((r) => r.key),
    channel: a.channels.map((r) => r.key),
  };

  const noData = a.ingest.lastSessionAt === null;
  const hasFilters = Object.keys(filters).length > 0;

  // Carry the active dashboard filters into the sessions list (the drill-down).
  const fromDay = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const matchQs = new URLSearchParams({ from: fromDay, ...filters });

  return (
    <>
      <LiveRefresh intervalMs={20000} />
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 9 }}>Overview</h1>
          <div className={`rec-bar ${noData ? 'idle' : ''}`}>
            <span className="rec-dot" />
            {noData ? (
              <>
                idle <span className="rec-sep">·</span> no sessions yet
              </>
            ) : (
              <>
                REC <span className="rec-sep">·</span> watching <strong>{project.name}</strong>
                <span className="rec-sep">·</span> {a.ingest.sessionsToday} today
                <span className="rec-sep">·</span> last {timeAgo(a.ingest.lastSessionAt!)}
              </>
            )}
          </div>
        </div>
        <RangeSelector days={days} />
      </div>

      {!noData && (
        <div className="filter-shell">
          <FilterBar
            projectId={projectId}
            days={days}
            filters={filters}
            options={options}
            segments={project.settings?.segments ?? []}
          />
          <Link className="mini view-sessions" href={`/p/${projectId}/sessions?${matchQs.toString()}`}>
            View {a.kpis.sessions} {hasFilters ? 'matching ' : ''}session{a.kpis.sessions === 1 ? '' : 's'} →
          </Link>
        </div>
      )}

      {noData ? (
        <div className="empty" style={{ marginTop: 18 }}>
          <p>
            <strong>Waiting for your first session…</strong>
          </p>
          <p>
            Install the SDK from <Link href={`/p/${projectId}/settings`}>Settings</Link> and use your
            app. Sessions and analytics appear here within seconds.
          </p>
        </div>
      ) : (
        <>
          <AnalyticsView a={a} basePath={`/p/${projectId}`} days={days} drilldown />

          <div className="row" style={{ marginTop: 22 }}>
            <Link className="btn" href={`/p/${projectId}/issues`}>
              Triage issues →
            </Link>
            <Link className="btn" href={`/p/${projectId}/sessions`}>
              Browse sessions →
            </Link>
            <Link className="btn" href={`/p/${projectId}/heatmap`}>
              Heatmaps →
            </Link>
            <Link className="btn" href={`/p/${projectId}/funnels`}>
              Funnels →
            </Link>
          </div>
        </>
      )}
    </>
  );
}
