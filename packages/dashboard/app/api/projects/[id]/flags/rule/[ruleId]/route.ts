import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';

export async function DELETE(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string; ruleId: string }> },
) {
  const { id, ruleId } = await ctx.params;
  try {
    const result = await api(`/api/projects/${id}/flags/rule/${ruleId}`, { method: 'DELETE' });
    return NextResponse.json(result);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'flag delete failed' }, { status });
  }
}
