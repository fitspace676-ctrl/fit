import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  REFRESH_TOKEN_COOKIE,
  isSuperAdmin,
  verifyAccessToken,
} from '@/lib/auth-session';
import {
  isNavigationRequest,
  refreshTokens,
  sessionCookies,
  type RefreshedTokens,
} from '@/lib/session-refresh';

/**
 * SuperAdmin access gate.
 *
 * The entire `@fit/superadmin` app is SUPER_ADMIN-only, and this middleware is
 * the single chokepoint where that is enforced: every non-public request is
 * authenticated and its role asserted before any page or Server Action runs.
 *
 * Two answers, not one. An unauthenticated request is sent to the console's own
 * `/login`; an authenticated request from someone who is not a platform operator
 * gets `/403`. The console used to bounce both to `/403`, on the assumption that
 * operators arrive holding a session minted on another surface — but the session
 * cookies are host-only now (see `lib/auth-session.ts`), so nothing else can mint
 * one for this host and the console has to own its own door.
 *
 * Verification is the same HS256 check the API uses (Web Crypto, Edge-safe).
 * When `JWT_SECRET` is unset — e.g. an unconfigured preview — tokens can't be
 * trusted, so the gate fails closed and every request lands on the sign-in page.
 */

/** Paths reachable without a SUPER_ADMIN session — the sign-in and denial pages. */
const PUBLIC_PATHS = ['/login', '/403'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Attach a refreshed session's cookies to an outgoing response before returning it. */
function withRefreshed(res: NextResponse, refreshed: RefreshedTokens | null): NextResponse {
  if (refreshed) {
    for (const cookie of sessionCookies(refreshed)) {
      res.cookies.set(cookie.name, cookie.value, cookie.options);
    }
  }
  return res;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;
  let session = token && secret ? await verifyAccessToken(token, secret) : null;

  // On an expired/missing access token, silently mint a new session from the
  // refresh cookie — but only on a genuine navigation, so the API's single-use
  // rotation never races itself into a family revocation (the logout symptom).
  let refreshed: RefreshedTokens | null = null;
  if (!session && secret && isNavigationRequest(req)) {
    const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    if (refreshToken) {
      const pair = await refreshTokens(refreshToken);
      if (pair) {
        session = await verifyAccessToken(pair.accessToken, secret);
        if (session) refreshed = pair;
      }
    }
  }

  // 1. Unauthenticated → the console's sign-in, returning here afterwards.
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = `?from=${encodeURIComponent(`${pathname}${search}`)}`;
    return NextResponse.redirect(url);
  }

  // 2. Authenticated but not a platform operator → denied. No path leaks into
  //    history, and the answer is distinct from "sign in" because signing in
  //    again would not help: this account will never be a SUPER_ADMIN.
  if (!isSuperAdmin(session.role)) {
    const url = req.nextUrl.clone();
    url.pathname = '/403';
    url.search = '';
    return withRefreshed(NextResponse.redirect(url), refreshed);
  }

  return withRefreshed(NextResponse.next(), refreshed);
}

export const config = {
  // Run on every route except Next.js internals and static assets. `api` is
  // excluded because this gate answers with a REDIRECT, which is the wrong answer
  // for a route the browser reaches by `fetch` — `/api/session` enforces its own
  // auth and answers with a JSON status the client can act on.
  matcher: ['/', '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
