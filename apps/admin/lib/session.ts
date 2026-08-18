// @fit/admin — server-side session helper.
//
// `getServerSession()` resolves the authenticated identity inside Server
// Components and Route Handlers by verifying the session cookie against the
// shared `JWT_SECRET`. It is the server-side counterpart to the `useSession()`
// client hook; both project the same {@link Session} shape.

import { cookies } from 'next/headers';
import type { NextRequest } from 'next/server';
import { pickSessionToken, verifyAccessToken, type Session } from './auth-session';

export type { Session } from './auth-session';

/**
 * Resolve the current request's session, or `null` when unauthenticated.
 *
 * Pass the `NextRequest` when calling from middleware-adjacent code; omit it in
 * Server Components / Route Handlers and the cookie is read from `next/headers`.
 * Returns `null` (never throws) when no session cookie is present, the token
 * fails verification, or `JWT_SECRET` is unset — callers treat every case as
 * "not signed in".
 *
 * Which cookie is read is {@link pickSessionToken}'s decision: an operator
 * impersonating this gym is authenticated by the impersonation cookie, and every
 * screen below then renders for the owner they are acting as, because that is
 * the whole point of the feature.
 */
export async function getServerSession(req?: NextRequest): Promise<Session | null> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return null;
  }

  const jar = req ? req.cookies : await cookies();
  const token = pickSessionToken((name) => jar.get(name)?.value);
  if (!token) {
    return null;
  }

  return verifyAccessToken(token.value, secret);
}
