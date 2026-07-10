import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, expectedToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  const configured = process.env.DASHBOARD_PASSWORD;
  if (!configured) {
    // Auth disabled — accept anything so local setups aren't locked out.
    return NextResponse.json({ ok: true });
  }
  if (password !== configured) {
    return NextResponse.json({ error: 'invalid password' }, { status: 401 });
  }
  const token = await expectedToken();
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, token!, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 86_400,
  });
  return res;
}
