import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';

export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const qs = req.nextUrl.search;
  try {
    const groups = await api(`/api/projects/${id}/issues${qs}`);
    return NextResponse.json(groups);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'issues fetch failed' }, { status });
  }
}
