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

  return (
    <>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Sessions</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            {chips.length
              ? `${sessions.length} session${sessions.length === 1 ? '' : 's'} matching the filter.`
              : 'Recorded sessions, newest first. Issues link to the exact moment.'}
          </p>
        </div>
      </div>

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
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Entry page</th>
                <th>Duration</th>
                <th>Events</th>
                <th>Device</th>
                <th>Status</th>
                <th style={{ width: 70 }}></th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s) => (
                <tr key={s.id}>
                  <td>{timeAgo(s.startedAt)}</td>
                  <td className="mono">{pathOfUrl(s.urlFirst)}</td>
                  <td className="muted">{duration(s.startedAt, s.endedAt)}</td>
                  <td>{s.eventCount}</td>
                  <td className="muted">{s.device ?? '—'}</td>
                  <td>
                    <span className="chip">{s.status}</span>
                  </td>
                  <td>
                    <Link href={`/p/${projectId}/sessions/${encodeURIComponent(s.id)}`}>watch</Link>
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
