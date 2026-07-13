import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { IssueGroup, Overview } from '@snag/shared';
import { api } from '@/lib/api';
import { resolveDemo } from '@/lib/demo';
import { timeAgo } from '@/lib/format';
import { BarList } from '@/components/charts';
import { AreaChart } from '@/components/AreaChart';

export const dynamic = 'force-dynamic';

export default async function DemoOverview({ params }: { params: Promise<{ publicId: string }> }) {
  const { publicId } = await params;
  const project = await resolveDemo(publicId);
  if (!project) notFound();

  const [ov, issues] = await Promise.all([
    api<Overview>(`/api/projects/${project.id}/overview`),
    api<IssueGroup[]>(`/api/projects/${project.id}/issues`),
  ]);
  const topOpen = issues.filter((g) => g.status === 'open').slice(0, 5);

  return (
    <>
      <h1>Overview</h1>
      <p className="subtitle">
        <span className="mono">{project.name}</span> — health at a glance.
      </p>

      {ov.ingest.lastSessionAt && (
        <div className="ingest-bar">
          <span className="dot accent" />
          <span>
            Last session <strong>{timeAgo(ov.ingest.lastSessionAt)}</strong>
          </span>
          <span className="ingest-sep" />
          <span className="mono">{ov.ingest.eventsTotal.toLocaleString()} events</span>
          <span className="ingest-sep" />
          <span className="mono">{ov.totals.sessions} sessions</span>
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
            high
          </div>
          <div className="stat-value" style={{ color: 'var(--high)' }}>
            {ov.bySeverity.high}
          </div>
        </div>
        <div className="stat">
          <div className="stat-label">
            <span className="dot medium" />
            medium
          </div>
          <div className="stat-value" style={{ color: 'var(--medium)' }}>
            {ov.bySeverity.medium}
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
            <AreaChart data={ov.issuesOverTime} height={200} yLabel="issues" />
          </div>
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Top detectors</h2>
          <BarList rows={ov.topDetectors} />
        </div>
      </div>

      {topOpen.length > 0 && (
        <>
          <h2>Recent issues</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 104 }}>severity</th>
                  <th>issue</th>
                  <th style={{ width: 148 }}>detector</th>
                  <th style={{ width: 110 }}>last seen</th>
                </tr>
              </thead>
              <tbody>
                {topOpen.map((g) => (
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
                    </td>
                    <td>
                      <span className="chip">{g.detector}</span>
                    </td>
                    <td className="muted">{timeAgo(g.lastSeen)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="row" style={{ marginTop: 16 }}>
            <Link className="btn" href={`/demo/${publicId}/issues`}>
              All issues →
            </Link>
            <Link className="btn" href={`/demo/${publicId}/sessions`}>
              Sessions →
            </Link>
          </div>
        </>
      )}
    </>
  );
}
