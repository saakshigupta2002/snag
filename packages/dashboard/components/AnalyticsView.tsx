import Link from 'next/link';
import type { Analytics } from '@snag/shared';
import { BarList } from './charts';
import { AreaChart } from './AreaChart';

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

/**
 * The whole analytics body, shared by the owner Overview and the public demo so
 * the two can't drift. Presentational + server-rendered (no hooks). When
 * `drilldown` is on, every breakdown row, insight and chart point links to the
 * sessions behind it: the click → filter → replay loop. The demo passes it off
 * (read-only, nowhere to drill).
 */
export function AnalyticsView({
  a,
  basePath,
  days,
  drilldown = false,
}: {
  a: Analytics;
  basePath: string;
  days: number;
  drilldown?: boolean;
}) {
  const n = a.kpis.sessions;
  const perf = a.performance;
  const sd = a.scrollDepth;

  // Drill target: the sessions list, pre-filtered and scoped to this window.
  const fromDay = new Date(Date.now() - (days - 1) * 86_400_000).toISOString().slice(0, 10);
  const sess = (params: Record<string, string>): string => {
    const p = new URLSearchParams({ from: fromDay, ...params });
    return `${basePath}/sessions?${p.toString()}`;
  };
  const dim = (key: string) => (drilldown ? (v: string) => sess({ [key]: v }) : undefined);
  // The chart appends its own ?from=&to= for the selected day/range.
  const drillBase = drilldown ? `${basePath}/sessions` : undefined;

  // A KPI/insight tile: a plain div, or a drill-down link when interactive.
  const Tile = ({
    href,
    className,
    children,
  }: {
    href?: string;
    className: string;
    children: React.ReactNode;
  }) =>
    href ? (
      <Link href={href} className={`${className} tile-link`}>
        {children}
      </Link>
    ) : (
      <div className={className}>{children}</div>
    );

  return (
    <>
      {/* ── KPI row ─────────────────────────────────────────────── */}
      <div className="stat-row" style={{ marginTop: 18 }}>
        <Tile className="stat" href={drilldown ? sess({}) : undefined}>
          <div className="stat-label">sessions</div>
          <div className="stat-value">{n}</div>
        </Tile>
        <div className="stat">
          <div className="stat-label">pages / session</div>
          <div className="stat-value">{a.kpis.avgPagesPerSession.toFixed(2)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">avg duration</div>
          <div className="stat-value">{fmtDuration(a.kpis.avgDurationMs)}</div>
        </div>
        <div className="stat">
          <div className="stat-label">scroll depth</div>
          <div className="stat-value">
            {a.kpis.avgScrollPct != null ? `${a.kpis.avgScrollPct}%` : '-'}
          </div>
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
        <span className="user-div" />
        <div className="user-metric">
          <div className="user-num">{a.users.unique}</div>
          <div className="user-label">unique users</div>
        </div>
        <div className="user-metric">
          <div className="user-num">{a.users.new}</div>
          <div className="user-label">
            <i className="dot seg-new-dot" /> new
          </div>
        </div>
        <div className="user-metric">
          <div className="user-num">{a.users.returning}</div>
          <div className="user-label">
            <i className="dot seg-ret-dot" /> returning
          </div>
        </div>
        <div className="user-spacer" />
        <div
          className="user-splitmini"
          title={`${a.users.new} new · ${a.users.returning} returning`}
        >
          <span className="seg-new" style={{ width: `${splitPct(a.users.new, a.users.returning)}%` }} />
          <span className="seg-ret" style={{ width: `${splitPct(a.users.returning, a.users.new)}%` }} />
        </div>
      </div>

      {/* ── Behaviour insights ──────────────────────────────────── */}
      <h2>Behaviour insights</h2>
      <div className="insight-grid">
        {a.insights.map((ins) => (
          <Tile
            className="insight-card"
            key={ins.detector}
            href={drilldown && ins.sessions > 0 ? sess({ detector: ins.detector }) : undefined}
          >
            <div className="insight-label">{ins.label}</div>
            <div className="insight-pct">{ins.pct}%</div>
            <div className="insight-sub muted">
              {ins.sessions} session{ins.sessions === 1 ? '' : 's'}
            </div>
          </Tile>
        ))}
      </div>

      {/* ── Breakdowns ──────────────────────────────────────────── */}
      <div className="ov-grid">
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Devices</h2>
          <BarList rows={a.device} total={n} empty="No device data." hrefFor={dim('device')} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Browsers</h2>
          <BarList rows={a.browser} total={n} empty="No browser data." hrefFor={dim('browser')} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Operating systems</h2>
          <BarList rows={a.os} total={n} empty="No OS data." hrefFor={dim('os')} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Countries</h2>
          <BarList rows={a.countries} total={n} empty="No geo data yet." hrefFor={dim('country')} />
        </div>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Channels</h2>
          <BarList rows={a.channels} total={n} empty="No traffic yet." hrefFor={dim('channel')} />
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
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Smart events</h2>
          {a.smartEvents.length === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              Track key actions by calling <code>Snag.event(&quot;name&quot;)</code> in your app.
            </p>
          ) : (
            <BarList
              rows={a.smartEvents.map((e) => ({ key: e.name, count: e.sessions }))}
              total={n}
            />
          )}
        </div>
      </div>

      {/* ── Scroll reach · performance · errors · bots ──────────── */}
      <div className="ov-grid">
        <div className="card">
          <div className="section-head">
            <h2 style={{ margin: 0 }}>Scroll reach</h2>
            {sd.sampleSize > 0 && <span className="eyebrow">{sd.sampleSize} sampled</span>}
          </div>
          {sd.sampleSize === 0 ? (
            <p className="muted" style={{ fontSize: 12.5 }}>
              No scroll data captured yet.
            </p>
          ) : (
            <div className="scroll-depth">
              {sd.buckets.map((b) => (
                <div className="sd-row" key={b.pct}>
                  <span className="sd-label mono">≥{b.pct}%</span>
                  <div className="sd-track">
                    <div className="sd-fill" style={{ width: `${b.sharePct}%` }} />
                  </div>
                  <span className="sd-val mono">{b.sharePct}%</span>
                </div>
              ))}
              <p className="muted sd-note">Share of sessions reaching each depth of the page.</p>
            </div>
          )}
        </div>

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
                  <i className="dot" style={{ background: 'var(--medium)' }} /> {perf.needs}% needs work
                </span>
                <span>
                  <i className="dot" style={{ background: 'var(--high)' }} /> {perf.poor}% poor
                </span>
              </div>
              <dl className="ctx" style={{ marginTop: 14 }}>
                <dt>LCP</dt>
                <dd className="mono">{perf.lcpMs != null ? `${(perf.lcpMs / 1000).toFixed(2)}s` : '-'}</dd>
                <dt>INP≈</dt>
                <dd className="mono">{perf.inpMs != null ? `${perf.inpMs}ms` : '-'}</dd>
                <dt>CLS</dt>
                <dd className="mono">{perf.cls != null ? perf.cls.toFixed(3) : '-'}</dd>
              </dl>
            </>
          )}
        </div>

        <Tile className="card" href={drilldown && a.jsErrors.sessionsWith > 0 ? sess({ errors: '1' }) : undefined}>
          <h2 style={{ marginTop: 0 }}>JavaScript errors</h2>
          <div className="perf-score">
            <span className="perf-score-num">{a.jsErrors.pct}%</span>
            <span className="muted">of sessions</span>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            {a.jsErrors.total} error{a.jsErrors.total === 1 ? '' : 's'} across{' '}
            {a.jsErrors.sessionsWith} session{a.jsErrors.sessionsWith === 1 ? '' : 's'}.
          </p>
        </Tile>

        <Tile className="card" href={drilldown && a.bots.sessions > 0 ? sess({ bot: '1' }) : undefined}>
          <h2 style={{ marginTop: 0 }}>Bot traffic</h2>
          <div className="perf-score">
            <span className="perf-score-num">{a.bots.pct}%</span>
            <span className="muted">of sessions</span>
          </div>
          <p className="muted" style={{ fontSize: 12.5, marginBottom: 0 }}>
            {a.bots.sessions} likely bot session{a.bots.sessions === 1 ? '' : 's'} (by user-agent).
          </p>
        </Tile>
      </div>

      {/* ── Trends + issues ─────────────────────────────────────── */}
      <div className="ov-grid">
        <div className="card">
          <div className="section-head">
            <h2 style={{ margin: 0 }}>Sessions</h2>
            <span className="eyebrow">last {days} days</span>
          </div>
          <div style={{ marginTop: 12 }}>
            <AreaChart data={a.sessionsOverTime} height={190} yLabel="sessions" drillBase={drillBase} />
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
          <BarList rows={a.topDetectors} empty="Nothing flagged yet." hrefFor={dim('detector')} />
        </div>
      </div>
    </>
  );
}
