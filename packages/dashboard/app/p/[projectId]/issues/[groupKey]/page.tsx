import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Issue, IssueGroup, RawEvent } from '@snag/shared';
import { normalize, type NormalizedEvent } from '@snag/detectors';
import { api, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { ReplayPlayer } from '@/components/ReplayPlayer';
import { StatusButtons } from '@/components/StatusButtons';

export const dynamic = 'force-dynamic';

const EVIDENCE_WINDOW_MS = 15_000;

/** Side-panel: the console/network/navigation signals around the moment —
 *  tying the visible frustration to its technical cause. */
function evidenceAround(events: RawEvent[], tsStart: number, tsEnd: number): NormalizedEvent[] {
  return normalize(events)
    .filter(
      (e) =>
        e.ts >= tsStart - EVIDENCE_WINDOW_MS &&
        e.ts <= tsEnd + EVIDENCE_WINDOW_MS &&
        (e.t === 'console' ||
          e.t === 'error' ||
          e.t === 'network' ||
          e.t === 'navigation' ||
          e.t === 'click' ||
          e.t === 'form'),
    )
    .slice(0, 80);
}

function EvidenceLine({ e, tsStart }: { e: NormalizedEvent; tsStart: number }) {
  const dt = `${((e.ts - tsStart) / 1000).toFixed(1)}s`;
  const inWindow = e.ts >= tsStart;
  switch (e.t) {
    case 'console':
      return (
        <div className={inWindow ? 'flagline' : ''}>
          <span className="t">{dt}</span>
          <span className="err">console.{e.level}</span> {e.message.slice(0, 160)}
        </div>
      );
    case 'error':
      return (
        <div className={inWindow ? 'flagline' : ''}>
          <span className="t">{dt}</span>
          <span className="err">uncaught</span> {e.message.slice(0, 160)}
        </div>
      );
    case 'network':
      return (
        <div>
          <span className="t">{dt}</span>
          <span className="net">
            {e.method} {e.path}
          </span>{' '}
          → {e.status ?? e.error ?? 'timeout'} ({e.durationMs}ms)
        </div>
      );
    case 'navigation':
      return (
        <div>
          <span className="t">{dt}</span>
          <span className="nav">navigate</span> {e.path} ({e.trigger})
        </div>
      );
    case 'click':
      return (
        <div>
          <span className="t">{dt}</span>click {e.selector}
          {e.text ? ` “${e.text.slice(0, 40)}”` : ''}
        </div>
      );
    case 'form':
      return (
        <div>
          <span className="t">{dt}</span>form {e.action} {e.formSelector}
        </div>
      );
    default:
      return null;
  }
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; groupKey: string }>;
}) {
  const { projectId, groupKey } = await params;

  let data: { group: IssueGroup; issues: Issue[] };
  try {
    data = await api(`/api/projects/${projectId}/issues/${groupKey}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { group, issues } = data;
  const sample = group.sample;

  let evidence: NormalizedEvent[] = [];
  if (sample.sessionId) {
    try {
      const { events } = await api<{ events: RawEvent[] }>(
        `/api/sessions/${encodeURIComponent(sample.sessionId)}/events`,
      );
      evidence = evidenceAround(events, sample.tsStart, sample.tsEnd);
    } catch {
      // replay pruned — the issue record still stands on its own
    }
  }

  return (
    <>
      <p>
        <Link href={`/p/${projectId}/issues`}>← Issues</Link>
      </p>
      <h1>{group.title}</h1>
      <p className="subtitle row">
        <span className={`badge ${group.severity}`}>{group.severity}</span>
        <span className={`badge ${group.status}`}>{group.status}</span>
        <span className="chip">{group.detector}</span>
        <span className="muted">
          {group.occurrences} occurrence{group.occurrences === 1 ? '' : 's'} across{' '}
          {group.sessionCount} session{group.sessionCount === 1 ? '' : 's'} · first seen{' '}
          {timeAgo(group.firstSeen)} · last seen {timeAgo(group.lastSeen)}
        </span>
      </p>

      {group.aiSummary && (
        <div className="ai-summary">
          <div className="tag">AI read (your key)</div>
          {group.aiSummary}
        </div>
      )}

      <div className="detail-grid">
        <div>
          {sample.sessionId ? (
            <ReplayPlayer sessionId={sample.sessionId} seekToTs={sample.tsStart} />
          ) : (
            <div className="empty">
              The raw session for this issue has been pruned by retention. The issue record (and
              your verdict) is kept.
            </div>
          )}
          <StatusButtons projectId={projectId} groupKey={group.groupKey} status={group.status} />
          {sample.note && (
            <p className="muted">
              Note: <em>{sample.note}</em>
            </p>
          )}
        </div>

        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>What happened around it</h2>
            {evidence.length ? (
              <div className="evidence">
                {evidence.map((e, i) => (
                  <EvidenceLine key={i} e={e} tsStart={sample.tsStart} />
                ))}
              </div>
            ) : (
              <p className="muted">No nearby console or network signals.</p>
            )}
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Evidence</h2>
            <pre className="snippet" style={{ whiteSpace: 'pre-wrap' }}>
              {JSON.stringify(sample.meta, null, 2)}
            </pre>
          </div>

          {issues.length > 1 && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Other occurrences</h2>
              {issues
                .slice(-8)
                .reverse()
                .map((i) => (
                  <div key={i.id} className="row" style={{ marginBottom: 6 }}>
                    <span className="muted">{timeAgo(i.createdAt)}</span>
                    {i.sessionId ? (
                      <Link
                        href={`/p/${projectId}/sessions/${encodeURIComponent(i.sessionId)}?ts=${i.tsStart}`}
                      >
                        watch
                      </Link>
                    ) : (
                      <span className="muted">replay pruned</span>
                    )}
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
