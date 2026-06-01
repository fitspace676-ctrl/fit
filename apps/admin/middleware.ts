import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  hasRoleAtLeast,
  isStaff,
  requiredRoleForPath,
  verifyAccessToken,
} from '@/lib/auth-session';

/**
 * Admin auth + role gate.
 *
 * Three checks run in order on every non-public route:
 *   1. Authenticated — no valid session ⇒ redirect to `/login?from=<path>`.
 *   2. Staff — a plain `MEMBER` has no business in the admin console ⇒ `/403`.
 *   3. Route permission — areas like `/settings/billing` require `OWNER`+
 *      (see `ROUTE_PERMISSIONS`); an under-privileged staffer ⇒ `/403`.
 *
 * Verification is the same HS256 check the API uses. When `JWT_SECRET` is unset
 * (e.g. an unconfigured preview) tokens can't be trusted, so the gate fails
 * closed and only the public routes below render.
 */

/** Paths reachable without a session — the sign-in flow and the 403 page itself. */
const PUBLIC_PATHS = ['/login', '/forgot-password', '/reset-password', '/403'];

function isPublicPath(pathname: string): boolean {
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

  // 1. Unauthenticated → sign in, then come back.
  if (!session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = '/login';
    loginUrl.search = '';
    loginUrl.searchParams.set('from', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  // 2. Authenticated but not staff → forbidden.
  if (!isStaff(session.role)) {
    return forbidden(req);
  }

  // 3. Staff but lacking the role this area requires → forbidden.
  const required = requiredRoleForPath(pathname);
  if (required && !hasRoleAtLeast(session.role, required)) {
    return forbidden(req);
  }

  return NextResponse.next();
}

/** Redirect to the `/403` page without leaking the attempted path into history. */
function forbidden(req: NextRequest): NextResponse {
  const url = req.nextUrl.clone();
  url.pathname = '/403';
  url.search = '';
  return NextResponse.redirect(url);
}

export const config = {
  // Run on every route except Next.js internals, static assets, and files.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
