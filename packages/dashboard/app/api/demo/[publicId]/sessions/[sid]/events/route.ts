import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';
import { resolveDemo } from '@/lib/demo';

// Public events proxy for the read-only demo. Serves events ONLY for sessions
// that belong to a shared project — nothing else is reachable without login.
export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ publicId: string; sid: string }> },
) {
  const { publicId, sid } = await ctx.params;
  const project = await resolveDemo(publicId);
  if (!project) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const sessionId = decodeURIComponent(sid);
  if (!sessionId.startsWith(`${project.id}:`)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  }
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(sessionId)}/events`);
    return NextResponse.json(data);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'events fetch failed' }, { status });
  }
}
