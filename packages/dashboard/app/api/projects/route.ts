import { NextResponse, type NextRequest } from 'next/server';
import { api, ApiError } from '@/lib/api';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const project = await api('/api/projects', { method: 'POST', body: JSON.stringify(body) });
    return NextResponse.json(project);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : 500;
    return NextResponse.json({ error: 'create failed' }, { status });
  }
}
