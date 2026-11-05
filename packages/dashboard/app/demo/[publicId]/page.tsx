import Link from 'next/link';
import { notFound } from 'next/navigation';
import type { Analytics } from '@snag/shared';
import { api } from '@/lib/api';
import { resolveDemo } from '@/lib/demo';
import { timeAgo } from '@/lib/format';
import { AnalyticsView } from '@/components/AnalyticsView';
import { RangeSelector } from '@/components/RangeSelector';

export const dynamic = 'force-dynamic';

export default async function DemoOverview({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { publicId } = await params;
  const project = await resolveDemo(publicId);
  if (!project) notFound();

  const sp = await searchParams;
  const days = Math.min(Math.max(Number(sp.days) || 14, 1), 90);
  // The unguessable publicId (resolved above) is the capability; the token-bearing
  // server call to the private analytics route is safe because project.id came
  // from resolveDemo, never from user input.
  const a = await api<Analytics>(`/api/projects/${project.id}/analytics?days=${days}`);

  const noData = a.ingest.lastSessionAt === null;

  return (
    <>
      <div className="section-head" style={{ alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ marginBottom: 4 }}>Overview</h1>
          <p className="subtitle" style={{ margin: 0 }}>
            <span className="mono">{project.name}</span>:{' '}
            {noData ? 'no sessions yet.' : <>last session {timeAgo(a.ingest.lastSessionAt!)}</>}
          </p>
        </div>
        <RangeSelector days={days} />
      </div>

      {noData ? (
        <div className="empty" style={{ marginTop: 18 }}>
          <p>
            <strong>No sessions recorded yet.</strong>
          </p>
          <p>This is a read-only demo. Analytics appear here once the app records traffic.</p>
        </div>
      ) : (
        <>
          <AnalyticsView a={a} basePath={`/demo/${publicId}`} days={days} />
          <div className="row" style={{ marginTop: 22 }}>
            <Link className="btn" href={`/demo/${publicId}/issues`}>
              Browse issues →
            </Link>
            <Link className="btn" href={`/demo/${publicId}/sessions`}>
              Browse sessions →
            </Link>
          </div>
        </>
      )}
    </>
  );
}
