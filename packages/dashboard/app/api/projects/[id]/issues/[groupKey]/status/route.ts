import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string; groupKey: string }> },
) {
  const { id, groupKey } = await ctx.params;
  try {
    const body = await req.json();
    const result = await api(`/api/projects/${id}/issues/${groupKey}/status`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'status update failed' }, { status });
  }
}
