import Link from 'next/link';
import type { Analytics, Project } from '@snag/shared';
import { api } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { BarList } from '@/components/charts';
import { AreaChart } from '@/components/AreaChart';
import { RangeSelector } from '@/components/RangeSelector';

export const dynamic = 'force-dynamic';

function splitPct(a: number, b: number): number {
  const total = a + b;
  return total ? (a / total) * 100 : 0;
}

function fmtDuration(ms: number): string {
  if (!ms) return '0s';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${s % 60}s`;
}

export default async function OverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ days?: string }>;
}) {
  const { projectId } = await params;
  const days = Math.min(Math.max(Number((await searchParams).days) || 14, 1), 90);
  const [project, a] = await Promise.all([
    api<Project>(`/api/projects/${projectId}`),
    api<Analytics>(`/api/projects/${projectId}/analytics?days=${days}`),
  ]);

  const noData = a.ingest.lastSessionAt === null;
  const n = a.kpis.sessions;
  const perf = a.performance;

  return (
    <>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Overview</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            {project.name} —{' '}
            {noData ? (
              'no sessions yet.'
            ) : (
              <>
                last session {timeAgo(a.ingest.lastSessionAt!)} · {a.ingest.sessionsToday} today
              </>
            )}
          </p>
        </div>
        <RangeSelector days={days} />
      </div>

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
          {/* ── KPI row ─────────────────────────────────────────────── */}
          <div className="stat-row" style={{ marginTop: 18 }}>
            <div className="stat">
              <div className="stat-label">sessions</div>
              <div className="stat-value">{n}</div>
            </div>
            <div className="stat">
              <div className="stat-label">pages / session</div>
              <div className="stat-value">{a.kpis.avgPagesPerSession.toFixed(2)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">avg duration</div>
              <div className="stat-value">{fmtDuration(a.kpis.avgDurationMs)}</div>
            </div>
            <div className="stat">
              <div className="stat-label">events</div>
              <div className="stat-value">{a.kpis.eventsTotal.toLocaleString()}</div>
            </div>
          </div>

          {/* ── Users ───────────────────────────────────────────────── */}
          <div className="users-row">
            <div className="user-metric">
              <div className="user-num">
                <span className={`live-dot ${a.users.live > 0 ? 'on' : ''}`} />
                {a.users.live}
              </div>
              <div className="user-label">live now</div>
            </div>
            <div className="user-metric">
              <div className="user-num">{a.users.unique}</div>
              <div className="user-label">unique users</div>
            </div>
            <div className="user-metric grow">
              <div className="split-bar">
                <span
                  className="seg-new"
                  style={{ width: `${splitPct(a.users.new, a.users.returning)}%` }}
                />
                <span
                  className="seg-ret"
                  style={{ width: `${splitPct(a.users.returning, a.users.new)}%` }}
                />
              </div>
              <div className="split-legend">
                <span>
                  <i className="dot seg-new-dot" /> {a.users.new} new
                </span>
                <span>
                  <i className="dot seg-ret-dot" /> {a.users.returning} returning
                </span>
              </div>
            </div>
          </div>

          {/* ── Behaviour insights ──────────────────────────────────── */}
          <h2>Behaviour insights</h2>
          <div className="insight-grid">
            {a.insights.map((ins) => (
              <div className="insight-card" key={ins.detector}>
                <div className="insight-label">{ins.label}</div>
                <div className="insight-pct">{ins.pct}%</div>
                <div className="insight-sub muted">
                  {ins.sessions} session{ins.sessions === 1 ? '' : 's'}
                </div>
              </div>
            ))}
          </div>

          {/* ── Breakdowns ──────────────────────────────────────────── */}
          <div className="ov-grid">
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Devices</h2>
              <BarList rows={a.device} total={n} empty="No device data." />
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Browsers</h2>
              <BarList rows={a.browser} total={n} empty="No browser data." />
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Operating systems</h2>
              <BarList rows={a.os} total={n} empty="No OS data." />
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Countries</h2>
              <BarList rows={a.countries} total={n} empty="No geo data yet." />
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Referrers</h2>
              <BarList rows={a.referrers} total={n} empty="Direct / none." />
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Entry pages</h2>
              <BarList rows={a.entryPages} empty="No page data." />
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Exit pages</h2>
              <BarList rows={a.exitPages} empty="No page data." />
            </div>
          </div>

          {/* ── Performance · errors · bots ─────────────────────────── */}
          <div className="ov-grid">
            <div className="card">
              <div className="section-head">
                <h2 style={{ margin: 0 }}>Performance</h2>
                {perf.sampleSize > 0 && <span className="eyebrow">{perf.sampleSize} sampled</span>}
              </div>
              {perf.sampleSize === 0 ? (
                <p className="muted" style={{ fontSize: 12.5 }}>
                  No Web-Vitals captured yet.
                </p>
              ) : (
                <>
                  <div className="perf-score">
                    <span className="perf-score-num">{perf.score}</span>
                    <span className="muted">/ 100</span>
                  </div>
                  <div className="perf-bar">
                    <span style={{ width: `${perf.good}%`, background: 'var(--green)' }} />
                    <span style={{ width: `${perf.needs}%`, background: 'var(--medium)' }} />
                    <span style={{ width: `${perf.poor}%`, background: 'var(--high)' }} />
                  </div>
                  <div className="perf-legend muted">
                    <span>
                      <i className="dot" style={{ background: 'var(--green)' }} /> {perf.good}% good
                    </span>
                    <span>
                      <i className="dot" style={{ background: 'var(--medium)' }} /> {perf.needs}%
                      needs work
                    </span>
                    <span>
                      <i className="dot" style={{ background: 'var(--high)' }} /> {perf.poor}% poor
                    </span>
                  </div>
                  <dl className="ctx" style={{ marginTop: 14 }}>
                    <dt>LCP</dt>
                    <dd className="mono">{perf.lcpMs != null ? `${(perf.lcpMs / 1000).toFixed(2)}s` : '—'}</dd>
                    <dt>INP≈</dt>
                    <dd className="mono">{perf.inpMs != null ? `${perf.inpMs}ms` : '—'}</dd>
                    <dt>CLS</dt>
                    <dd className="mono">{perf.cls != null ? perf.cls.toFixed(3) : '—'}</dd>
                  </dl>
                </>
              )}
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>JavaScript errors</h2>
              <div className="perf-score">
                <span className="perf-score-num">{a.jsErrors.pct}%</span>
                <span className="muted">of sessions</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
                {a.jsErrors.total} error{a.jsErrors.total === 1 ? '' : 's'} across{' '}
                {a.jsErrors.sessionsWith} session{a.jsErrors.sessionsWith === 1 ? '' : 's'}.
              </p>
            </div>

            <div className="card">
              <h2 style={{ marginTop: 0 }}>Bot traffic</h2>
              <div className="perf-score">
                <span className="perf-score-num">{a.bots.pct}%</span>
                <span className="muted">of sessions</span>
              </div>
              <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
                {a.bots.sessions} likely bot session{a.bots.sessions === 1 ? '' : 's'} (by user-agent).
              </p>
            </div>
          </div>

          {/* ── Trends + issues ─────────────────────────────────────── */}
          <div className="ov-grid">
            <div className="card">
              <div className="section-head">
                <h2 style={{ margin: 0 }}>Sessions</h2>
                <span className="eyebrow">last {days} days</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <AreaChart data={a.sessionsOverTime} height={190} yLabel="sessions" />
              </div>
            </div>
            <div className="card">
              <div className="section-head">
                <h2 style={{ margin: 0 }}>New issues</h2>
                <span className="eyebrow">last {days} days</span>
              </div>
              <div style={{ marginTop: 12 }}>
                <AreaChart data={a.issuesOverTime} height={190} yLabel="issues" />
              </div>
            </div>
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Top detectors</h2>
              <BarList rows={a.topDetectors} empty="Nothing flagged yet." />
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
      )}
    </>
  );
}
