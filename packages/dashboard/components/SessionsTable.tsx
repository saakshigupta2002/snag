import Link from 'next/link';
import type { Session } from '@snag/shared';
import { duration, pathOfUrl, timeAgo } from '@/lib/format';
import { SessionActions } from './SessionActions';

function fmtMs(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

/** True when a session has no meaningful user action (idle / bounce). */
export function isLowSignal(s: Session): boolean {
  return (s.interactions ?? 1) === 0;
}

/** Rank most-active first, then most-recent. */
export function byActivity(a: Session, b: Session): number {
  const ia = a.interactions ?? 0;
  const ib = b.interactions ?? 0;
  if (ib !== ia) return ib - ia;
  return a.startedAt < b.startedAt ? 1 : -1;
}

/**
 * The sessions table. `activeMs` (engaged time) is the headline duration, with
 * wall-clock total on hover, so an idle-inflated recording reads honestly. The
 * activity count is what ranks and segments the list.
 */
export function SessionsTable({
  sessions,
  basePath,
  owner = false,
}: {
  sessions: Session[];
  basePath: string;
  owner?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="sessions-table">
        <thead>
          <tr>
            <th>Started</th>
            <th>Entry page</th>
            <th style={{ width: 116 }}>Active</th>
            <th style={{ width: 92 }}>Activity</th>
            <th style={{ width: 116 }}>Device</th>
            <th style={{ width: 110 }}>Browser</th>
            <th style={{ width: 96 }}>Status</th>
            <th style={{ width: 72 }}></th>
            {owner && <th style={{ width: 64 }}></th>}
          </tr>
        </thead>
        <tbody>
          {sessions.map((s) => {
            const total = s.durationMs ?? null;
            const active = s.activeMs ?? total;
            const inter = s.interactions;
            return (
              <tr key={s.id}>
                <td className="muted">{timeAgo(s.startedAt)}</td>
                <td className="mono">{pathOfUrl(s.urlFirst)}</td>
                <td className="mono num" title={total != null ? `${duration(s.startedAt, s.endedAt)} total` : undefined}>
                  {fmtMs(active)}
                  {total != null && active != null && total - active > 4000 && (
                    <span className="dur-total"> / {fmtMs(total)}</span>
                  )}
                </td>
                <td className="mono num">
                  {inter == null ? (
                    <span className="muted">—</span>
                  ) : inter === 0 ? (
                    <span className="muted">0</span>
                  ) : (
                    <span className="act-count">{inter}</span>
                  )}
                </td>
                <td className="muted">{s.device ?? '—'}</td>
                <td className="muted">{s.browser ?? '—'}</td>
                <td>
                  <span className={`st ${s.status}`}>{s.status}</span>
                </td>
                <td>
                  <Link className="watch-btn" href={`${basePath}/${encodeURIComponent(s.id)}`}>
                    ▶ Watch
                  </Link>
                </td>
                {owner && (
                  <td>
                    <SessionActions sessionId={s.id} favorite={s.favorite} />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
