import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';

export async function PUT(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; detector: string }> },
) {
  const { id, detector } = await ctx.params;
  try {
    const body = await req.json();
    const rule = await api(`/api/projects/${id}/flags/${detector}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    });
    return NextResponse.json(rule);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'flag update failed' }, { status });
  }
}
