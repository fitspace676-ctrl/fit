import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from '@/lib/auth-session';

/**
 * Web auth gate.
 *
 * Every route is protected by default; only the paths below render without a
 * session. An unauthenticated request to a protected route is redirected to
 * `/login?from=<original path>` so the user lands back where they were after
 * signing in. Verification is the same HS256 check the API uses — when
 * `JWT_SECRET` is unset (e.g. an unconfigured preview) tokens can't be trusted,
 * so the gate fails closed and only the public routes below render.
 */

/** Paths anyone can reach without a session. `/` is the public landing page. */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password'];

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;
  const session = token && secret ? await verifyAccessToken(token, secret) : null;

  if (!session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('from', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route except Next.js internals, static assets, and files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
