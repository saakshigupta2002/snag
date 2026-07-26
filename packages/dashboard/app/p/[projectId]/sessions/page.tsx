import Link from 'next/link';
import type { Session } from '@snag/shared';
import { api } from '@/lib/api';
import { ActiveFilters, type FilterChip } from '@/components/ActiveFilters';
import { SessionsTable, isLowSignal, byActivity } from '@/components/SessionsTable';

export const dynamic = 'force-dynamic';

const FILTER_KEYS = [
  'device',
  'browser',
  'os',
  'country',
  'channel',
  'detector',
  'errors',
  'bot',
  'from',
  'to',
  'funnel',
  'drop',
  'reach',
] as const;

function fmtDur(ms: number): string {
  if (!ms) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** Turn the raw query params into human-readable chips for the filter bar. */
function chipsFor(sp: Record<string, string | undefined>): FilterChip[] {
  const chips: FilterChip[] = [];
  const plain: Record<string, string> = {
    device: 'Device',
    browser: 'Browser',
    os: 'OS',
    country: 'Country',
    channel: 'Channel',
  };
  for (const [key, label] of Object.entries(plain)) {
    if (sp[key]) chips.push({ key, label: `${label}: ${sp[key]}` });
  }
  if (sp.detector) chips.push({ key: 'detector', label: `Detector: ${sp.detector}` });
  if (sp.errors === '1') chips.push({ key: 'errors', label: 'Has JS errors' });
  if (sp.bot === '1') chips.push({ key: 'bot', label: 'Bots only' });
  if (sp.bot === '0') chips.push({ key: 'bot', label: 'Humans only' });
  if (sp.from && sp.to && sp.from !== sp.to) chips.push({ key: 'range', label: `${sp.from} → ${sp.to}` });
  else if (sp.from) chips.push({ key: 'from', label: `On ${sp.from}` });
  const fname = sp.fname || 'Funnel';
  if (sp.funnel && sp.drop != null) {
    chips.push({ key: 'funnel', label: `${fname}: dropped before step ${Number(sp.drop) + 1}` });
  } else if (sp.funnel && sp.reach != null) {
    chips.push({ key: 'funnel', label: `${fname}: reached step ${Number(sp.reach) + 1}` });
  }
  return chips;
}

export default async function SessionsPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { projectId } = await params;
  const sp = await searchParams;

  const qs = new URLSearchParams();
  for (const k of FILTER_KEYS) if (sp[k]) qs.set(k, sp[k]!);
  const query = qs.toString();
  const chips = chipsFor(sp);

  const sessions = await api<Session[]>(
    `/api/projects/${projectId}/sessions${query ? `?${query}` : ''}`,
  );

  // Split real sessions from idle/bounce noise, and rank the real ones so the
  // sessions worth watching sit on top.
  const active = sessions.filter((s) => !isLowSignal(s)).sort(byActivity);
  const lowSignal = sessions.filter(isLowSignal).sort(byActivity);
  const basePath = `/p/${projectId}/sessions`;

  // Slim, data-face summary of the (possibly filtered) result set.
  const durs = active.map((s) => s.activeMs ?? s.durationMs).filter((d): d is number => d != null && d > 0);
  const avgDur = durs.length ? Math.round(durs.reduce((a, b) => a + b, 0) / durs.length) : 0;
  const withErr = sessions.filter((s) => (s.jsErrors ?? 0) > 0).length;
  const errPct = sessions.length ? Math.round((withErr / sessions.length) * 100) : 0;

  return (
    <>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 9 }}>Sessions</h1>
          <div className="summary-strip">
            <span>
              <b>{active.length}</b> active
            </span>
            <span className="ss-sep" />
            <span>
              avg <b>{fmtDur(avgDur)}</b> engaged
            </span>
            <span className="ss-sep" />
            <span className={errPct ? 'ss-alert' : ''}>
              <b>{errPct}%</b> with errors
            </span>
          </div>
        </div>
      </div>
      <p className="subtitle" style={{ marginTop: 6 }}>
        {chips.length
          ? 'Filtered from the overview. Sessions with real activity first.'
          : 'Sessions with real activity first. Idle and bounce sessions are tucked below.'}
      </p>

      {chips.length > 0 && (
        <ActiveFilters
          chips={chips}
          basePath={basePath}
          sp={sp}
          filterKeys={[...FILTER_KEYS]}
        />
      )}

      {sessions.length === 0 ? (
        <div className="empty">
          {chips.length ? (
            <>
              No sessions match this filter.{' '}
              <Link href={basePath}>Clear filters</Link> to see all sessions.
            </>
          ) : (
            <>
              No sessions yet. Install the SDK from{' '}
              <Link href={`/p/${projectId}/settings`}>Settings</Link> and use your app — sessions show
              up here within seconds.
            </>
          )}
        </div>
      ) : (
        <>
          {active.length > 0 ? (
            <SessionsTable sessions={active} basePath={basePath} owner />
          ) : (
            <div className="empty">
              No sessions with activity in this set — only idle/bounce visits (below).
            </div>
          )}

          {lowSignal.length > 0 && (
            <details className="lowsignal">
              <summary>
                <span className="ls-caret" aria-hidden>
                  ▸
                </span>
                <b>{lowSignal.length}</b> low-signal session{lowSignal.length === 1 ? '' : 's'} —
                no clicks or interactions
              </summary>
              <p className="ls-note muted">
                A visitor opened a page and left without interacting. Kept for completeness; they
                rarely tell you anything.
              </p>
              <SessionsTable sessions={lowSignal} basePath={basePath} owner />
            </details>
          )}
        </>
      )}
    </>
  );
}
