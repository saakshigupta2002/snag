import Link from 'next/link';
import { notFound } from 'next/navigation';
import { resolveDemo } from '@/lib/demo';
import { SessionReplay } from '@/components/SessionReplay';

export const dynamic = 'force-dynamic';

export default async function DemoSessionReplay({
  params,
  searchParams,
}: {
  params: Promise<{ publicId: string; sid: string }>;
  searchParams: Promise<{ ts?: string }>;
}) {
  const { publicId, sid } = await params;
  const { ts } = await searchParams;
  const project = await resolveDemo(publicId);
  if (!project) notFound();

  const sessionId = decodeURIComponent(sid);
  const flagTsStart = ts ? Number(ts) : undefined;

  // Guard: a shared link must never replay a session from another project.
  if (!sessionId.startsWith(`${project.id}:`)) notFound();

  return (
    <>
      <p>
        <Link href={`/demo/${publicId}/sessions`}>← Sessions</Link>
      </p>
      <h1>Session replay</h1>
      <p className="subtitle mono">{sessionId.split(':').pop()}</p>
      <SessionReplay sessionId={sessionId} flagTsStart={flagTsStart} publicId={publicId} />
    </>
  );
}
