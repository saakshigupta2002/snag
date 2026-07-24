import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Issue, IssueGroup, IssueNote, TrendPoint } from '@snag/shared';
import { api, ApiError } from '@/lib/api';
import { resolveDemo } from '@/lib/demo';
import { timeAgo } from '@/lib/format';
import { describeIssue, evidenceCode, issueSignals } from '@/lib/issue';
import { SessionReplay } from '@/components/SessionReplay';
import { AreaChart } from '@/components/AreaChart';

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

export default async function DemoIssueDetail({
  params,
}: {
  params: Promise<{ publicId: string; groupKey: string }>;
}) {
  const { publicId, groupKey } = await params;
  const project = await resolveDemo(publicId);
  if (!project) notFound();

  let data: { group: IssueGroup; issues: Issue[]; notes: IssueNote[]; trend: TrendPoint[] };
  try {
    data = await api(`/api/projects/${project.id}/issues/${groupKey}`);
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) notFound();
    throw err;
  }
  const { group, issues, notes, trend } = data;
  const sample = group.sample;
  const finding = describeIssue(group.detector, sample.meta);
  const code = evidenceCode(group.detector, sample.meta);
  const { isNew, isSpike } = issueSignals(group.firstSeen, trend);

  return (
    <>
      <p>
        <Link href={`/demo/${publicId}/issues`}>← Issues</Link>
      </p>
      <h1 style={{ maxWidth: '46ch' }}>{group.title}</h1>
      <p className="subtitle row">
        <span className={`badge ${group.severity}`}>{group.severity}</span>
        <span className={`badge ${group.status}`}>{group.status}</span>
        {isNew && <span className="badge tag-new">new</span>}
        {isSpike && <span className="badge tag-spike">spike</span>}
        <span className="chip">{group.detector}</span>
        <span className="muted">
          {group.occurrences} occurrence{group.occurrences === 1 ? '' : 's'} · {group.sessionCount}{' '}
          session{group.sessionCount === 1 ? '' : 's'} · last seen {timeAgo(group.lastSeen)}
        </span>
      </p>

      {finding && (
        <div className="finding">
          <div className="tag">What we found</div>
          <p className="finding-body">{finding}</p>
          {code && <pre className="finding-code">{code}</pre>}
          {sample.sessionId && (
            <p className="finding-hint muted">
              The flagged moment is highlighted on the replay timeline below — hit play, or click
              <span className="finding-chip">◆ flagged moment</span> to jump straight to it.
            </p>
          )}
        </div>
      )}

      {group.aiSummary && (
        <div className="ai-summary">
          <div className="tag">◆ AI read</div>
          {group.aiSummary}
        </div>
      )}

      {sample.sessionId ? (
        <SessionReplay
          sessionId={sample.sessionId}
          flagTsStart={sample.tsStart}
          flagTsEnd={sample.tsEnd}
          publicId={publicId}
          withEvidence
          report={{
            title: group.title,
            finding,
            pagePath: pageOf(sample.meta),
            sessionHref: `/demo/${publicId}/sessions/${encodeURIComponent(sample.sessionId)}?ts=${sample.tsStart}`,
          }}
        />
      ) : (
        <div className="empty" style={{ marginBottom: 18 }}>
          The raw session for this issue was pruned by retention.
        </div>
      )}

      <div className="ov-grid" style={{ marginTop: 18 }}>
        <div className="card">
          <h2 style={{ marginTop: 0 }}>Occurrences</h2>
          <AreaChart data={trend} height={150} />
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
                  <Link
                    href={`/demo/${publicId}/sessions/${encodeURIComponent(sample.sessionId)}?ts=${sample.tsStart}`}
                  >
                    watch full →
                  </Link>
                </dd>
              </>
            )}
          </dl>
        </div>
      </div>

      {notes.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>History</h2>
          <div className="notes">
            {notes.map((n) => (
              <div className="note" key={n.id}>
                <span className={`badge ${noteBadge(n.action)}`}>{n.action}</span>
                <div className="note-body">
                  {n.note && <div>{n.note}</div>}
                  <div className="muted mono" style={{ fontSize: 11 }}>
                    {timeAgo(n.createdAt)}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {issues.length > 1 && (
        <div className="card" style={{ marginTop: 16 }}>
          <h2 style={{ marginTop: 0 }}>Other occurrences</h2>
          {issues
            .slice(-8)
            .reverse()
            .map((i) => (
              <div key={i.id} className="row" style={{ marginBottom: 6, fontSize: 12.5 }}>
                <span className="muted">{timeAgo(i.createdAt)}</span>
                {i.sessionId ? (
                  <Link
                    href={`/demo/${publicId}/sessions/${encodeURIComponent(i.sessionId)}?ts=${i.tsStart}`}
                  >
                    watch
                  </Link>
                ) : (
                  <span className="muted">pruned</span>
                )}
              </div>
            ))}
        </div>
      )}
    </>
  );
}

function noteBadge(action: string): string {
  if (action === 'confirmed') return 'confirmed';
  if (action === 'dismissed') return 'dismissed';
  return 'open';
}
