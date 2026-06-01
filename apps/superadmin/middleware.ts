import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, isSuperAdmin, verifyAccessToken } from '@/lib/auth-session';

/**
 * SuperAdmin access gate.
 *
 * The entire `@fit/superadmin` app is SUPER_ADMIN-only, and this middleware is
 * the single chokepoint where that is enforced: every non-public request is
 * authenticated and its role asserted before any page or Server Action runs.
 *
 * Verification is the same HS256 check the API uses (Web Crypto, Edge-safe).
 * When `JWT_SECRET` is unset — e.g. an unconfigured preview — tokens can't be
 * trusted, so the gate fails closed and only the public `/403` route renders.
 * There is no sign-in UI here: operators obtain a SUPER_ADMIN session elsewhere
 * (the shared-domain auth cookie), so anyone without one is sent straight to
 * `/403` rather than a login page that doesn't exist.
 */

/** Paths reachable without a SUPER_ADMIN session — just the denial page itself. */
const PUBLIC_PATHS = ['/403'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  if (isPublicPath(req.nextUrl.pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;
  const session = token && secret ? await verifyAccessToken(token, secret) : null;

  // Unauthenticated or not a SUPER_ADMIN → denied. No path leaks into history.
  if (!session || !isSuperAdmin(session.role)) {
    const url = req.nextUrl.clone();
    url.pathname = '/403';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Run on every route except Next.js internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
