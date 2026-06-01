import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * SuperAdmin access gate — STUB.
 *
 * The entire `@fit/superadmin` app is SUPER_ADMIN-only. This middleware is the
 * single chokepoint where every request is authenticated and the caller's role
 * asserted before any page or route handler runs.
 *
 * Right now it is a pass-through placeholder so preview deploys render. The real
 * guard is implemented in **T2.12** (SuperAdmin platform console), which will:
 *   1. Read the session/JWT (Auth.js) from the request cookies.
 *   2. Reject unauthenticated requests → redirect to the sign-in page.
 *   3. Assert the `SUPER_ADMIN` role → 403 for any non-SuperAdmin user.
 *
 * Keep this file as the gate so the contract ("this whole app is SUPER_ADMIN
 * gated at the middleware level") is visible from day one.
 */
export function middleware(_request: NextRequest) {
  // TODO(T2.12): authenticate the session and assert the SUPER_ADMIN role here.
  return NextResponse.next();
}

export const config = {
  // Run on every route except Next.js internals and static assets.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
