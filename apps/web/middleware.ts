import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken, type Session } from '@/lib/auth-session';
import {
  REFRESH_TOKEN_COOKIE,
  isNavigationRequest,
  refreshTokens,
  setSessionCookies,
  type RefreshedTokens,
} from '@/lib/session-refresh';
import { isLocale, type Locale } from '@fit/i18n';
import { routing } from '@/src/i18n/routing';

/**
 * Web middleware — locale routing + auth gate, in that order.
 *
 * next-intl owns the URL locale prefix (`/ka/...` default, `/en/...`) and
 * persists the choice in the `NEXT_LOCALE` cookie. On top of it sits the same
 * auth gate as before: every route is protected by default, and the public
 * paths below render without a session. An unauthenticated request to a
 * protected route is redirected to `/<locale>/login?from=<original path>` so
 * the user lands back where they were after signing in. Verification is the
 * HS256 check the API uses — when `JWT_SECRET` is unset the gate fails closed.
 */

const handleI18nRouting = createMiddleware(routing);

/**
 * The member portal owns the `/member` path segment (after the locale prefix),
 * mirroring how the staff console owns `/admin`. Every member-facing route —
 * the portal itself, the join/checkout wizard, and the auth pages — lives under
 * it, so `/<locale>/member/...` is the canonical shape. Only the marketing
 * landing and the 403 page remain at the locale root.
 */
const MEMBER_BASE_PATH = '/member';

/** Locale-stripped paths anyone can reach without a session. `/` is public. */
const PUBLIC_PATHS = [
  '/member/login',
  '/member/register',
  '/member/forgot-password',
  '/member/reset-password',
  // Public discovery surface — a logged-out visitor browses the class schedule
  // and is only sent to /member/login when they act on a class (the booking CTA).
  '/member/classes',
  // Public discovery surface — the trainers index (T3.6) is pure browsing.
  '/member/trainers',
  // Purchase wizard — location/package selection is browsable signed-out; the
  // auth gate is the final payment step (T3.10), not the browse.
  '/member/checkout',
];

/** Split `/en/member/login` into its locale (`en`) and locale-less path (`/member/login`). */
function splitLocale(pathname: string): { locale: Locale; rest: string } {
  const [, maybeLocale, ...segments] = pathname.split('/');
  if (maybeLocale && isLocale(maybeLocale)) {
    const rest = `/${segments.join('/')}`;
    return { locale: maybeLocale, rest: rest === '/' ? '/' : rest.replace(/\/$/, '') };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

function isPublicPath(pathname: string): boolean {
  // `/` is handled explicitly (login / role dashboard), not as a public page.
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/** Where a signed-in session belongs: staff → the admin console, members → the portal home. */
function dashboardPath(session: Session, locale: Locale): string {
  return session.role !== 'MEMBER' ? '/admin' : `/${locale}${MEMBER_BASE_PATH}/home`;
}

/** The portal's sign-in page for `locale` — the single place the auth gate sends people. */
function loginPath(locale: Locale): string {
  return `/${locale}${MEMBER_BASE_PATH}/login`;
}

/** Attach any freshly-refreshed cookies to an outgoing response before returning it. */
function withRefreshed(res: NextResponse, refreshed: RefreshedTokens | null): NextResponse {
  if (refreshed) setSessionCookies(res, refreshed);
  return res;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const { locale, rest } = splitLocale(pathname);

  // Resolve the session from the access-token cookie. If it's missing/expired,
  // silently mint a fresh one from the refresh cookie — but only on a genuine
  // navigation, so the API's single-use rotation never races itself into a
  // family revocation (which would log the user out).
  const secret = process.env.JWT_SECRET;
  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  let session = token && secret ? await verifyAccessToken(token, secret) : null;
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

  // Root: open the login page directly (no marketing landing), or send a
  // signed-in user straight to the dashboard their role belongs in.
  if (rest === '/') {
    const target = req.nextUrl.clone();
    target.search = '';
    target.pathname = session ? dashboardPath(session, locale) : loginPath(locale);
    return withRefreshed(NextResponse.redirect(target), refreshed);
  }

  // Public routes render without a session (but still carry a refreshed cookie).
  if (isPublicPath(rest)) {
    return withRefreshed(handleI18nRouting(req), refreshed);
  }

  if (!session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = loginPath(locale);
    loginUrl.search = '';
    loginUrl.searchParams.set('from', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return withRefreshed(handleI18nRouting(req), refreshed);
}

export const config = {
  // Run on every route except API handlers, Next.js internals, files, and the
  // `/admin/*` prefix — the latter is proxied to the staff console (@fit/admin)
  // by a rewrite and must not be locale-prefixed or auth-gated by the member site.
  matcher: ['/((?!api|admin|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
