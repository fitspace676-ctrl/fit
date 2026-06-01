// @fit/admin — server-side session helper.
//
// `getServerSession()` resolves the authenticated identity inside Server
// Components and Route Handlers by verifying the `accessToken` cookie against
// the shared `JWT_SECRET`. It is the server-side counterpart to the
// `useSession()` client hook; both project the same {@link Session} shape.

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE, verifyAccessToken, type Session } from './auth-session';

export type { Session } from './auth-session';

/**
 * Resolve the current request's session, or `null` when unauthenticated.
 *
 * Pass the `NextRequest` when calling from middleware-adjacent code; omit it in
 * Server Components / Route Handlers and the cookie is read from `next/headers`.
 * Returns `null` (never throws) when the cookie is absent, the token fails
 * verification, or `JWT_SECRET` is unset — callers treat every case as
 * "not signed in".
 */
export async function getServerSession(req?: NextRequest): Promise<Session | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return null;
  }

  const token = req
    ? req.cookies.get(ACCESS_TOKEN_COOKIE)?.value
    : (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return verifyAccessToken(token, secret);
}
