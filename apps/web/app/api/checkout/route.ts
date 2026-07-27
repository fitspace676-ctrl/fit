// @fit/web — join-wizard checkout proxy.
//
// The wizard's payment step runs in the browser, but the API access token lives
// in an httpOnly cookie the client deliberately cannot read — and the API is on
// a different origin (Railway) than the portal (`<slug>.formacore.io`), so the
// cookie is never sent with a direct cross-origin call either. A client `fetch`
// straight to `POST /checkout` therefore always arrives unauthenticated and is
// rejected with `401 AUTH_REQUIRED`, no matter that the buyer just signed up.
//
// This same-origin route closes both gaps the same way the rest of the app does:
// read the cookie server-side, forward a Bearer token. Mirrors
// `app/api/notifications/route.ts` and the cookie→Bearer forwarding in
// `lib/profile.ts`.

import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';

const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * `POST /api/checkout` — buy the chosen catalogue product as the signed-in
 * member.
 *
 * The body is forwarded verbatim: it names only *what* is being bought, and the
 * API resolves the gym, the member and the price from the session, so there is
 * nothing here worth validating twice. The API's status and body are passed
 * back unchanged so the step can branch on its error codes (`422
 * PRODUCT_UNAVAILABLE`, `409 ALREADY_SUBSCRIBED`) and show the real message
 * rather than a generic failure.
 */
export async function POST(req: NextRequest): Promise<NextResponse> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return NextResponse.json(
      { code: 'AUTH_REQUIRED', message: 'A member session is required to check out' },
      { status: 401 },
    );
  }

  const body = (await req.json().catch(() => null)) as unknown;

  const response = await fetch(`${API_URL}/checkout`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body ?? {}),
    cache: 'no-store',
  });

  const result = (await response.json().catch(() => null)) as unknown;
  return NextResponse.json(result ?? { code: 'CHECKOUT_FAILED' }, { status: response.status });
}
