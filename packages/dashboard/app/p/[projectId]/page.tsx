import Link from 'next/link';
import type { Overview, Project } from '@snag/shared';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { BarList } from '@/components/charts';
import { AreaChart } from '@/components/AreaChart';

export const dynamic = 'force-dynamic';

export default async function OverviewPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  const [project, ov] = await Promise.all([
    api<Project>(`/api/projects/${projectId}`),
    api<Overview>(`/api/projects/${projectId}/overview`),
  ]);

  const noData = ov.ingest.lastSessionAt === null;

  return (
    <>
      <h1>Overview</h1>
      <p className="subtitle">
        <span className="mono">{project.name}</span> — health at a glance.
      </p>

      {noData ? (
        <div className="empty" style={{ marginBottom: 26 }}>
          <p>
            <strong>Waiting for your first session…</strong>
          </p>
          <p>
            Install the SDK from <Link href={`/p/${projectId}/settings`}>Settings</Link> and use your
            app. Sessions and issues will appear here within seconds of the first page view.
          </p>
        </div>
      ) : (
        <div className="ingest-bar">
          <span className="dot accent" />
          <span>
            Last session <strong>{timeAgo(ov.ingest.lastSessionAt!)}</strong>
          </span>
          <span className="ingest-sep" />
          <span className="mono">{ov.ingest.sessionsToday} today</span>
          <span className="ingest-sep" />
          <span className="mono">{ov.ingest.eventsTotal.toLocaleString()} events</span>
        </div>
      )}

      <div className="stat-row">
        <div className="stat">
          <div className="stat-label">
            <span className="dot accent" />
            open issues
          </div>
          <div className="stat-value">{ov.totals.openIssues}</div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot high" />
            high severity
          </div>
          <div className="stat-value" style={{ color: 'var(--high)' }}>
            {ov.bySeverity.high}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot" style={{ background: 'var(--green)' }} />
            confirmed
          </div>
          <div className="stat-value" style={{ color: 'var(--green)' }}>
            {ov.totals.confirmedIssues}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot low" />
            sessions
          </div>
          <div className="stat-value">{ov.totals.sessions}</div>
        </div>
      </div>

      <div className="ov-grid">
        <div className="card">
          <div className="section-head">
            <h2 style={{ margin: 0 }}>New issues</h2>
            <span className="eyebrow">last 14 days</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <AreaChart data={ov.issuesOverTime} height={210} yLabel="issues" />
          </div>
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Open by severity</h2>
          <BarList
            rows={[
              { key: 'high', count: ov.bySeverity.high },
              { key: 'medium', count: ov.bySeverity.medium },
              { key: 'low', count: ov.bySeverity.low },
            ]}
          />
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Top detectors</h2>
          <BarList rows={ov.topDetectors} />
        </div>

        <div className="card">
          <h2 style={{ marginTop: 0 }}>Most-affected pages</h2>
          <BarList rows={ov.topPages} />
        </div>
      </div>

      <div className="row" style={{ marginTop: 22 }}>
        <Link className="btn" href={`/p/${projectId}/issues`}>
          Triage issues →
        </Link>
        <Link className="btn" href={`/p/${projectId}/sessions`}>
          Browse sessions →
        </Link>
      </div>
    </>
  );
}
