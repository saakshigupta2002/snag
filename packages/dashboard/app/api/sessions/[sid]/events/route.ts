import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';

export async function GET(_req: NextRequest, ctx: { params: Promise<{ sid: string }> }) {
  const { sid } = await ctx.params;
  try {
    const data = await api(`/api/sessions/${encodeURIComponent(sid)}/events`);
    return NextResponse.json(data);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'events fetch failed' }, { status });
  }
}
