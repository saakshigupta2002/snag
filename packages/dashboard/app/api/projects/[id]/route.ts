import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const body = await req.json();
    const project = await api(`/api/projects/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    });
    return NextResponse.json(project);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'update failed' }, { status });
  }
}
