import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import {
  ACCESS_TOKEN_COOKIE,
  hasRoleAtLeast,
  isStaff,
  requiredRoleForPath,
  verifyAccessToken,
} from '@/lib/auth-session';
import {
  REFRESH_TOKEN_COOKIE,
  isNavigationRequest,
  refreshTokens,
  sessionCookies,
  type RefreshedTokens,
} from '@/lib/session-refresh';

/**
 * Admin auth + role gate.
 *
 * Three checks run in order on every non-public route:
 *   1. Authenticated — no valid session ⇒ redirect to the web app's sign-in.
 *   2. Staff — a plain `MEMBER` has no business in the admin console ⇒ `/403`.
 *   3. Route permission — areas like `/settings/billing` require `OWNER`+
 *      (see `ROUTE_PERMISSIONS`); an under-privileged staffer ⇒ `/403`.
 *
 * Verification is the same HS256 check the API uses. When `JWT_SECRET` is unset
 * (e.g. an unconfigured preview) tokens can't be trusted, so the gate fails
 * closed and only the public routes below render.
 *
 * The console has **no sign-in of its own** — the web app owns login at the
 * subdomain root (`/{locale}/login`), outside this app's `/admin` basePath. So
 * an unauthenticated request is bounced there, not to a nonexistent `/admin/login`.
 */

/**
 * This app's basePath when served behind the tenant proxy (`<slug>.<root>/admin`).
 * `req.nextUrl.pathname` is already basePath-stripped, so we re-add it when
 * building the `from` return-path and in-app redirect targets. Unset (standalone
 * `*.vercel.app` deployment) → empty, and paths stay at the root.
 */
const BASE_PATH = process.env.ADMIN_BASE_PATH ?? '';

/** Paths reachable without a session — the 403 page itself (there is no in-app login). */
const PUBLIC_PATHS = ['/403'];

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

/**
 * Absolute redirect to `path`, resolved against the **tenant-facing** origin.
 *
 * Behind the proxy this app runs on a `*.vercel.app` upstream, but the user is on
 * `<slug>.<root>` — so we rebuild the origin from `x-forwarded-host`/`-proto`
 * (set by the proxy) and fall back to the request origin when unproxied. `path`
 * is used verbatim: we pass a plain `URL` (not `req.nextUrl.clone()`, which would
 * re-apply this app's `/admin` basePath), so callers include the basePath only
 * where they mean to. Next requires redirect targets to be absolute — a relative
 * `Location` header throws "Invalid URL".
 */
function redirectTo(req: NextRequest, path: string): NextResponse {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  const origin = forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
  return NextResponse.redirect(new URL(path, origin));
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

  // 1. Unauthenticated → the web app's sign-in at the subdomain root (outside
  //    this app's basePath), then come back to the full console path via `from`.
  if (!session) {
    const from = `${BASE_PATH}${pathname}${search}`;
    return redirectTo(req, `/login?from=${encodeURIComponent(from)}`);
  }

  // 2. Authenticated but not staff → forbidden (an in-app page, so basePath-prefixed).
  if (!isStaff(session.role)) {
    return withRefreshed(redirectTo(req, `${BASE_PATH}/403`), refreshed);
  }

  // 3. Staff but lacking the role this area requires → forbidden.
  const required = requiredRoleForPath(pathname);
  if (required && !hasRoleAtLeast(session.role, required)) {
    return withRefreshed(redirectTo(req, `${BASE_PATH}/403`), refreshed);
  }

  return withRefreshed(NextResponse.next(), refreshed);
}

export const config = {
  // Run on every route except Next.js internals, static assets, and files.
  // The bare `/` entry is required because the negative-lookahead pattern below
  // does not match the index route on its own — without it the dashboard (served
  // at the basePath root, `/admin`) would skip the auth gate entirely.
  matcher: ['/', '/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
