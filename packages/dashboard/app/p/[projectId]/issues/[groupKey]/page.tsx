import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Issue, IssueGroup, IssueNote, TrendPoint } from '@snag/shared';
import { api, ApiError } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { SessionReplay } from '@/components/SessionReplay';
import { StatusButtons } from '@/components/StatusButtons';
import { ShareButton } from '@/components/ShareButton';
import { Sparkline } from '@/components/charts';

export const dynamic = 'force-dynamic';

function pageOf(meta: Record<string, unknown>): string {
  const raw = (meta.page as string) || (meta.url as string) || '';
  if (!raw) return '—';
  try {
    return new URL(raw, 'http://x.local').pathname || '/';
  } catch {
    return raw;
  }
}

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ projectId: string; groupKey: string }>;
}) {
  const { projectId, groupKey } = await params;

  let data: { group: IssueGroup; issues: Issue[]; notes: IssueNote[]; trend: TrendPoint[] };
  try {
    data = await api(`/api/projects/${projectId}/issues/${groupKey}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { group, issues, notes, trend } = data;
  const sample = group.sample;

  return (
    <>
      <p>
        <Link href={`/p/${projectId}/issues`}>← Issues</Link>
      </p>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <h1 style={{ maxWidth: '46ch' }}>{group.title}</h1>
        <ShareButton />
      </div>
      <p className="subtitle row">
        <span className={`badge ${group.severity}`}>{group.severity}</span>
        <span className={`badge ${group.status}`}>{group.status}</span>
        <span className="chip">{group.detector}</span>
        <span className="muted">
          {group.occurrences} occurrence{group.occurrences === 1 ? '' : 's'} · {group.sessionCount}{' '}
          session{group.sessionCount === 1 ? '' : 's'} · last seen {timeAgo(group.lastSeen)}
        </span>
      </p>

      {group.aiSummary && (
        <div className="ai-summary">
          <div className="tag">◆ AI read · your key</div>
          {group.aiSummary}
        </div>
      )}

      {sample.sessionId ? (
        <SessionReplay
          sessionId={sample.sessionId}
          flagTsStart={sample.tsStart}
          flagTsEnd={sample.tsEnd}
          withEvidence
        />
      ) : (
        <div className="empty" style={{ marginBottom: 18 }}>
          The raw session for this issue was pruned by retention. Your verdict is kept.
        </div>
      )}

      <div className="detail-grid" style={{ marginTop: 18 }}>
        <StatusButtons projectId={projectId} groupKey={group.groupKey} status={group.status} />

        <div>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>Occurrences</h2>
            <Sparkline data={trend} height={56} />
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>Context</h2>
            <dl className="ctx">
              <dt>page</dt>
              <dd className="mono">{pageOf(sample.meta)}</dd>
              <dt>detector</dt>
              <dd className="mono">{group.detector}</dd>
              <dt>first seen</dt>
              <dd>{timeAgo(group.firstSeen)}</dd>
              <dt>sessions</dt>
              <dd>{group.sessionCount}</dd>
              {sample.sessionId && (
                <>
                  <dt>session</dt>
                  <dd>
                    <Link href={`/p/${projectId}/sessions/${encodeURIComponent(sample.sessionId)}?ts=${sample.tsStart}`}>
                      watch full →
                    </Link>
                  </dd>
                </>
              )}
            </dl>
          </div>

          <div className="card">
            <h2 style={{ marginTop: 0 }}>History</h2>
            {notes.length === 0 ? (
              <p className="muted" style={{ fontSize: 12.5 }}>No verdict yet.</p>
            ) : (
              <div className="notes">
                {notes.map((n) => (
                  <div className="note" key={n.id}>
                    <span className={`badge ${noteBadge(n.action)}`}>{n.action}</span>
                    <div className="note-body">
                      {n.note && <div>{n.note}</div>}
                      <div className="muted mono" style={{ fontSize: 11 }}>{timeAgo(n.createdAt)}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {issues.length > 1 && (
            <div className="card">
              <h2 style={{ marginTop: 0 }}>Other occurrences</h2>
              {issues
                .slice(-8)
                .reverse()
                .map((i) => (
                  <div key={i.id} className="row" style={{ marginBottom: 6, fontSize: 12.5 }}>
                    <span className="muted">{timeAgo(i.createdAt)}</span>
                    {i.sessionId ? (
                      <Link href={`/p/${projectId}/sessions/${encodeURIComponent(i.sessionId)}?ts=${i.tsStart}`}>
                        watch
                      </Link>
                    ) : (
                      <span className="muted">pruned</span>
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

function noteBadge(action: string): string {
  if (action === 'confirmed') return 'confirmed';
  if (action === 'dismissed') return 'dismissed';
  return 'open';
}
