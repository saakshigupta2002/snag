import { NextResponse, type NextRequest } from 'next/server';
import { AUTH_COOKIE, isAuthed } from './lib/auth';

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (
    pathname === '/login' ||
    pathname === '/api/login' ||
    pathname.startsWith('/_next') ||
    pathname === '/favicon.ico' ||
    // Public, read-only demo share — no login required.
    pathname.startsWith('/demo') ||
    pathname.startsWith('/api/demo')
  ) {
    return NextResponse.next();
  }
  if (await isAuthed(req.cookies.get(AUTH_COOKIE)?.value)) {
    return NextResponse.next();
  }
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
