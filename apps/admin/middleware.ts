import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { isStaff, pickSessionToken, verifyAccessToken } from '@/lib/auth-session';
import { CONSOLE_PATHNAME_HEADER } from '@/lib/console-pathname';
import {
  appendLegacySessionClear,
  clearImpersonationCookies,
  clearSessionCookies,
} from '@/lib/session-cookies';
import {
  REFRESH_TOKEN_COOKIE,
  isNavigationRequest,
  refreshTokens,
  sessionCookies,
  type RefreshedTokens,
} from '@/lib/session-refresh';
import {
  TENANT_MISMATCH_REASON,
  isTenantMismatch,
  requestGymSlug,
  resolveTenantHost,
} from '@/lib/tenant-host';

/**
 * Admin auth gate.
 *
 * Two checks run in order on every non-public route:
 *   1. Authenticated — no valid session ⇒ redirect to the web app's sign-in.
 *   2. Staff — a plain `MEMBER` has no business in the admin console ⇒ `/403`.
 *
 * **There used to be a third: a minimum-role check per route prefix.** It is gone,
 * because what a route requires is now a CAPABILITY and what a role holds is
 * editable per gym — which means the answer lives in `Gym.settings`, and this
 * file runs on the Edge where reading them per request is not cheap. The gate
 * moved to `app/(dashboard)/layout.tsx`, which already fetches those settings and
 * runs before any page below it renders. See `lib/route-guards.ts`.
 *
 * What is left here is exactly what a JWT can answer on its own, which is also
 * what this runtime is good at: is there a session, and is it staff. Everything
 * gym-shaped happens one layer in.
 *
 * This file still contributes one thing the layout cannot get for itself: the
 * REQUESTED PATH. The App Router hands `searchParams` and `params` to pages but
 * never a pathname to a layout, so the path is forwarded as
 * {@link CONSOLE_PATHNAME_HEADER} on the request and read back there. A layout
 * that could not tell which route it was wrapping could not gate one.
 *
 * Verification is the same HS256 check the API uses. When `JWT_SECRET` is unset
 * (e.g. an unconfigured preview) tokens can't be trusted, so the gate fails
 * closed and only the public routes below render.
 *
 * **A session only counts on its own gym's host.** A token whose `gymSlug`
 * differs from the slug the request's host names is sent to this host's sign-in
 * with its cookies cleared — the impersonation cookies when that is what carried
 * it, the session cookies otherwise. The sign-in page itself clears the same way
 * (on a verified mismatch, or when `lib/api.ts` sent the operator there after the
 * API refused a session with `403 TENANT_MISMATCH`) but never redirects, so a
 * cookie the browser will not drop cannot loop it.
 *
 * The console owns its **own sign-in** at `/admin/login` (inside this app's
 * basePath), so an unauthenticated request is bounced there. The member site's
 * `/{locale}/login` still signs staff in too — it sends a non-MEMBER session
 * straight here after login — but the console is no longer dependent on it.
 */

/**
 * This app's basePath when served behind the tenant proxy (`<slug>.<root>/admin`).
 * `req.nextUrl.pathname` is already basePath-stripped, so we re-add it when
 * building the `from` return-path and in-app redirect targets.
 *
 * **The default must match `next.config.mjs`'s**, which is `/admin`. It used to
 * default to `''` here, and since `ADMIN_BASE_PATH` is not set on the Vercel
 * deployment the two disagreed: Next served the console under `/admin` while
 * this file believed there was no prefix. Every redirect was then built without
 * it — an unauthenticated operator was sent to `/login` (the *member* site's
 * sign-in) instead of `/admin/login`, carrying a `from` that had lost the prefix
 * too. A deployment that genuinely runs at the root sets `ADMIN_BASE_PATH=""`,
 * which is an empty string rather than nullish and so still wins here.
 */
const BASE_PATH = process.env.ADMIN_BASE_PATH ?? '/admin';

/**
 * Paths reachable without a session — the console's own sign-in, the owner
 * activation page, the 403 page, and the impersonation handoff.
 *
 * `/activate` is public for the same reason `/login` is, only more so: a gym owner
 * arrives there from their onboarding email holding a single-use token and, very
 * often, no password at all — the page is where the password comes from, so a
 * session gate on it would be a door locked from the inside.
 *
 * `/impersonation/start` is public BECAUSE it is what creates the session: a
 * platform operator arrives there holding a single-use code and nothing else, so
 * gating it behind a session would mean the only way to be let in is to already
 * be in. `/impersonation/exit` is public for the mirror-image reason — it must
 * still work when the impersonated token it is clearing has already expired.
 */
const PUBLIC_PATHS = ['/login', '/activate', '/403', '/impersonation'];

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

/**
 * Continue to the app, telling the dashboard layout which path was asked for.
 *
 * The header is set on the REQUEST (not the response): `NextResponse.next({
 * request })` rewrites what the app receives, so `headers()` inside a Server
 * Component sees it. It is also overwritten unconditionally rather than merged,
 * so a client cannot forge the value by sending the header itself — that would
 * be a way to make the layout gate the wrong route.
 */
function forward(req: NextRequest): NextResponse {
  const headers = new Headers(req.headers);
  headers.set(CONSOLE_PATHNAME_HEADER, req.nextUrl.pathname);
  return NextResponse.next({ request: { headers } });
}

/**
 * Attach a refreshed session's cookies to an outgoing response before returning
 * it — always last, since the legacy clear it appends would be dropped by a
 * later `res.cookies.set`.
 */
function withRefreshed(res: NextResponse, refreshed: RefreshedTokens | null): NextResponse {
  if (refreshed) {
    for (const cookie of sessionCookies(refreshed)) {
      res.cookies.set(cookie.name, cookie.value, cookie.options);
    }
    appendLegacySessionClear(res);
  }
  return res;
}

/** The console's sign-in, coming back to the requested console path afterwards. */
function toSignIn(req: NextRequest): NextResponse {
  const { pathname, search } = req.nextUrl;
  const from = `${BASE_PATH}${pathname}${search}`;
  return redirectTo(req, `${BASE_PATH}/login?from=${encodeURIComponent(from)}`);
}

/**
 * The sign-in page renders as-is, but first drops a session that belongs to
 * another gym: one whose verified token names a different gym than this host,
 * or any session at all when `?reason=tenant` says the API already refused it.
 * The impersonation cookies are cleared before the session ones — see
 * `clearSessionCookies`.
 */
async function signInPage(
  req: NextRequest,
  secret: string | undefined,
  hostGymSlug: string | null,
): Promise<NextResponse> {
  const res = NextResponse.next();
  const token = pickSessionToken((name) => req.cookies.get(name)?.value);
  const session = token && secret ? await verifyAccessToken(token.value, secret) : null;
  const wrongGym =
    req.nextUrl.searchParams.get('reason') === TENANT_MISMATCH_REASON ||
    (session !== null && isTenantMismatch(session.gymSlug, hostGymSlug));
  if (wrongGym) {
    clearImpersonationCookies(res);
    clearSessionCookies(res);
  }
  return res;
}

export async function middleware(req: NextRequest): Promise<NextResponse> {
  const { pathname } = req.nextUrl;
  const forwardedHost = req.headers.get('x-forwarded-host');
  const host = req.headers.get('host');
  const hostGymSlug = requestGymSlug(forwardedHost, host);
  const secret = process.env.JWT_SECRET;

  if (pathname === '/login') {
    return signInPage(req, secret, hostGymSlug);
  }
  if (isPublicPath(pathname)) {
    return NextResponse.next();
  }

  const token = pickSessionToken((name) => req.cookies.get(name)?.value);
  let session = token && secret ? await verifyAccessToken(token.value, secret) : null;

  // An impersonated session that no longer verifies is OVER — expired, or the
  // secret rotated under it. It must not fall through to the refresh below or to
  // whatever `accessToken` sits beside it: both would silently swap the operator
  // into a different identity on a page they believe they are viewing as the
  // owner. Send them to the exit, which clears the cookie and hands them back to
  // the operator console.
  if (token?.impersonated && !session) {
    return redirectTo(req, `${BASE_PATH}/impersonation/exit`);
  }

  // On an expired/missing access token, silently mint a new session from the
  // refresh cookie — but only on a genuine navigation, so the API's single-use
  // rotation never races itself into a family revocation (the logout symptom).
  // Impersonated sessions are excluded by construction: they are issued without
  // a refresh token, so there is nothing here to renew them with, and that is
  // deliberate — an impersonation is meant to run out.
  // 0. Another gym's session → this host's sign-in, without it. An impersonation
  //    is dropped on its own, leaving whatever session the operator had beneath.
  if (session && isTenantMismatch(session.gymSlug, hostGymSlug)) {
    const res = toSignIn(req);
    if (token?.impersonated) {
      clearImpersonationCookies(res);
    } else {
      clearSessionCookies(res);
    }
    return res;
  }

  let refreshed: RefreshedTokens | null = null;
  if (!session && secret && isNavigationRequest(req)) {
    const refreshToken = req.cookies.get(REFRESH_TOKEN_COOKIE)?.value;
    if (refreshToken) {
      const pair = await refreshTokens(refreshToken, resolveTenantHost(forwardedHost, host));
      if (pair) {
        const renewed = await verifyAccessToken(pair.accessToken, secret);
        // A refresh can only renew the gym the token was issued for; if that is
        // not this host's gym, the renewed session is as wrong as the old one.
        if (renewed && isTenantMismatch(renewed.gymSlug, hostGymSlug)) {
          const res = toSignIn(req);
          clearSessionCookies(res);
          return res;
        }
        if (renewed) {
          session = renewed;
          refreshed = pair;
        }
      }
    }
  }

  // 1. Unauthenticated → the console's own sign-in (inside this app's basePath),
  //    then come back to the full console path via `from`. Staff used to be sent
  //    to the *member* site's `/login`; each surface now owns its own door, so an
  //    operator who bookmarked the console stays inside it to sign in.
  if (!session) {
    return toSignIn(req);
  }

  // 2. Authenticated but not staff → forbidden (an in-app page, so basePath-prefixed).
  if (!isStaff(session.role)) {
    return withRefreshed(redirectTo(req, `${BASE_PATH}/403`), refreshed);
  }

  // Staff. What this particular route requires of them is a capability question,
  // answered in `app/(dashboard)/layout.tsx` where the gym's settings are.
  return withRefreshed(forward(req), refreshed);
}

export const config = {
  // Run on every route except Next.js internals, static assets, and files.
  // The bare `/` entry is required because the negative-lookahead pattern below
  // does not match the index route on its own — without it the dashboard (served
  // at the basePath root, `/admin`) would skip the auth gate entirely.
  // `api` is excluded — matching the web app's matcher — because this gate
  // answers an unauthenticated request with a **redirect**, and a redirect is the
  // wrong answer for a route the browser reaches by `fetch`.
  //
  // The AI-agent panel POSTs to `/admin/api/agent/chat` and reads an NDJSON
  // stream back. A `fetch` is not a navigation (`sec-fetch-dest: empty`), so
  // `isNavigationRequest` is false and the silent refresh below never runs for
  // it: the moment the short-lived access token expired, the POST was answered
  // with a 307 to the sign-in page, `fetch` followed it, and the stream parser
  // was handed a page of HTML. The agent stopped working with no visible error.
  //
  // The API routes already enforce their own auth (`app/api/agent/chat`
  // and `app/api/session` both check the session and return a JSON 401), so
  // letting them past this gate makes them answer with a status the client can
  // actually act on.
  matcher: ['/', '/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
