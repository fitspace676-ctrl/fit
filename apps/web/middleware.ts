import createMiddleware from 'next-intl/middleware';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken } from '@/lib/auth-session';
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

/** Locale-stripped paths anyone can reach without a session. `/` is public. */
const PUBLIC_PATHS = [
  '/login',
  '/register',
  '/forgot-password',
  '/reset-password',
  // Public discovery surface — a logged-out visitor browses the class schedule
  // and is only sent to /login when they act on a class (the booking CTA).
  '/classes',
  // Public discovery surface — the trainers index (T3.6) is pure browsing.
  '/trainers',
];

/** Split `/en/login` into its locale (`en`) and locale-less path (`/login`). */
function splitLocale(pathname: string): { locale: Locale; rest: string } {
  const [, maybeLocale, ...segments] = pathname.split('/');
  if (maybeLocale && isLocale(maybeLocale)) {
    const rest = `/${segments.join('/')}`;
    return { locale: maybeLocale, rest: rest === '/' ? '/' : rest.replace(/\/$/, '') };
  }
  return { locale: routing.defaultLocale, rest: pathname };
}

function isPublicPath(pathname: string): boolean {
  if (pathname === '/') {
    return true;
  }
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname, search } = req.nextUrl;
  const { locale, rest } = splitLocale(pathname);

  // Public routes (and the locale-prefix redirect for `/`) are handled purely
  // by the i18n middleware — no session required.
  if (isPublicPath(rest)) {
    return handleI18nRouting(req);
  }

  const token = req.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const secret = process.env.JWT_SECRET;
  const session = token && secret ? await verifyAccessToken(token, secret) : null;

  if (!session) {
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = `/${locale}/login`;
    loginUrl.search = '';
    loginUrl.searchParams.set('from', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  return handleI18nRouting(req);
}

export const config = {
  // Run on every route except API handlers, Next.js internals, files, and the
  // `/admin/*` prefix — the latter is proxied to the staff console (@fit/admin)
  // by a rewrite and must not be locale-prefixed or auth-gated by the member site.
  matcher: ['/((?!api|admin|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
