import Link from 'next/link';
import { ReplayPlayer } from '@/components/ReplayPlayer';

export const dynamic = 'force-dynamic';

export default async function SessionReplayPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string; sid: string }>;
  searchParams: Promise<{ ts?: string }>;
}) {
  const { projectId, sid } = await params;
  const { ts } = await searchParams;
  const sessionId = decodeURIComponent(sid);
  const seekToTs = ts ? Number(ts) : undefined;

  return (
    <>
      <p>
        <Link href={`/p/${projectId}/sessions`}>← Sessions</Link>
      </p>
      <h1>Session replay</h1>
      <p className="subtitle mono">{sessionId.split(':').pop()}</p>
      <ReplayPlayer sessionId={sessionId} seekToTs={seekToTs} />
    </>
  );
}
