// @fit/superadmin — session cookie endpoint.
//
// The console signs operators in at `/login`, so this route covers the whole
// session lifecycle: *set* it (`POST`, from that sign-in), *read* it (`GET`, for
// client components that can't read an httpOnly cookie) and *clear* it
// (`DELETE`, sign-out).
//
// Every cookie written here is host-only and named `ops*` — see
// `lib/auth-session.ts` for why the operator identity is kept off the parent
// domain the tenant surfaces share.

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { REFRESH_TOKEN_COOKIE } from '@/lib/auth-session';
import { sessionCookies, clearedSessionCookies } from '@/lib/session-refresh';
import { getServerSession } from '@/lib/session';

/**
 * `GET /api/session` — the verified operator session.
 *
 * When the access cookie is not valid the answer also says whether the session is
 * **recoverable**: whether a refresh token is sitting beside it. The access token
 * lives 15 minutes and the refresh token 30 days, so an operator returning to an
 * open tab has the first expired and the second good. `middleware.ts` renews it
 * silently, but only on genuine navigations — and this route is reached by
 * `fetch`, which is not one. The flag lets a client ask for a navigation instead
 * of concluding "signed out".
 *
 * This route deliberately does NOT refresh: the API rotates the refresh token on
 * every use and revokes the family on reuse, so rotation has exactly one owner.
 */
export async function GET(): Promise<NextResponse> {
  const user = await getServerSession();
  if (user) {
    return NextResponse.json({ user, recoverable: false });
  }

  const recoverable = (await cookies()).get(REFRESH_TOKEN_COOKIE)?.value !== undefined;
  return NextResponse.json({ user: null, recoverable });
}

/**
 * `POST /api/session` — persist a freshly-issued token pair as httpOnly cookies.
 *
 * The tokens are only ever set as httpOnly cookies — never returned to, or
 * readable by, client JS — so an XSS on the console cannot read a session back
 * out. The role is NOT checked here: a non-operator can hold a valid session,
 * they simply can't get past `middleware.ts` with it.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const body = (await req.json().catch(() => null)) as {
    accessToken?: unknown;
    refreshToken?: unknown;
  } | null;
  const accessToken = typeof body?.accessToken === 'string' ? body.accessToken : null;
  const refreshToken = typeof body?.refreshToken === 'string' ? body.refreshToken : null;
  if (!accessToken || !refreshToken) {
    return NextResponse.json({ error: 'INVALID_BODY' }, { status: 400 });
  }

  const res = new NextResponse(null, { status: 204 });
  for (const cookie of sessionCookies({ accessToken, refreshToken })) {
    res.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return res;
}

/** `DELETE /api/session` — clear the operator session cookies (sign-out). */
export function DELETE(): NextResponse {
  const res = new NextResponse(null, { status: 204 });
  for (const cookie of clearedSessionCookies()) {
    res.cookies.set(cookie.name, cookie.value, cookie.options);
  }
  return res;
}
