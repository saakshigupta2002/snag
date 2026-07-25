import Link from 'next/link';
import type { Session } from '@snag/shared';
import { api } from '@/lib/api';
import { duration, pathOfUrl, timeAgo } from '@/lib/format';
import { ActiveFilters, type FilterChip } from '@/components/ActiveFilters';

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

  // Slim, data-face summary of the (possibly filtered) result set.
  const durs = sessions.map((s) => s.durationMs).filter((d): d is number => d != null && d > 0);
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
              <b>{sessions.length}</b> {chips.length ? 'matching' : 'recorded'}
            </span>
            <span className="ss-sep" />
            <span>
              avg <b>{fmtDur(avgDur)}</b>
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
          ? 'Filtered from the overview. Clear a chip to widen the set.'
          : 'Recorded sessions, newest first. Open one to watch the replay.'}
      </p>

      {chips.length > 0 && (
        <ActiveFilters
          chips={chips}
          basePath={`/p/${projectId}/sessions`}
          sp={sp}
          filterKeys={[...FILTER_KEYS]}
        />
      )}

      {sessions.length === 0 ? (
        <div className="empty">
          {chips.length ? (
            <>
              No sessions match this filter.{' '}
              <Link href={`/p/${projectId}/sessions`}>Clear filters</Link> to see all sessions.
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
        <div className="table-wrap">
          <table className="sessions-table">
            <thead>
              <tr>
                <th>Started</th>
                <th>Entry page</th>
                <th style={{ width: 92 }}>Duration</th>
                <th style={{ width: 78 }}>Events</th>
                <th style={{ width: 120 }}>Device</th>
                <th style={{ width: 120 }}>Browser</th>
                <th style={{ width: 96 }}>Status</th>
                <th style={{ width: 64 }}></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td className="muted">{timeAgo(s.startedAt)}</td>
                  <td className="mono">{pathOfUrl(s.urlFirst)}</td>
                  <td className="mono num">{duration(s.startedAt, s.endedAt)}</td>
                  <td className="mono num">{s.eventCount}</td>
                  <td className="muted">{s.device ?? '—'}</td>
                  <td className="muted">{s.browser ?? '—'}</td>
                  <td>
                    <span className={`st ${s.status}`}>{s.status}</span>
                  </td>
                  <td>
                    <Link className="watch-link" href={`/p/${projectId}/sessions/${encodeURIComponent(s.id)}`}>
                      watch →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
