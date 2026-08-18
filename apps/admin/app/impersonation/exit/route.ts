// @fit/admin — leaving an impersonated session.
//
// Clears the two impersonation cookies and sends the operator back to the
// console they came from. Deleting the cookies is the entire operation: the
// gym's own session cookie, if the operator had one on this host, is untouched
// and simply takes over again — which is the payoff for keeping the two under
// different names.
//
// The API is not called. The token is stateless and short-lived, so there is
// nothing server-side to revoke; the row that records the impersonation was
// written when it started, and it is the start that matters to an audit trail.

import { NextResponse, type NextRequest } from 'next/server';
import { IMPERSONATION_COOKIES, impersonationCookieOptions } from '@/lib/impersonation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** This app's basePath behind the tenant proxy — mirrors `middleware.ts`. */
const BASE_PATH = process.env.ADMIN_BASE_PATH ?? '/admin';

/**
 * Where to send the operator afterwards: the platform console.
 *
 * Normally that is `superadmin.<root>`, derived from the same root domain the
 * tenant hosts hang off — no second setting to keep in step. `SUPERADMIN_URL`
 * overrides it for the case the derivation cannot cover: local development,
 * where every app answers on `localhost` but on a different PORT, and where
 * `NEXT_PUBLIC_ROOT_DOMAIN` cannot carry one because this app also uses it to
 * pull the gym slug out of the request host.
 *
 * With neither configured there is no console host to name, so the operator
 * lands on this console's sign-in — signed out of the impersonation either way,
 * which is the part that must not depend on configuration.
 */
function operatorConsoleUrl(): string | null {
  const override = process.env.SUPERADMIN_URL?.trim();
  if (override) return override;

  const root = process.env.NEXT_PUBLIC_ROOT_DOMAIN?.trim().toLowerCase();
  if (!root) return null;
  const scheme = root === 'localhost' || root.startsWith('localhost:') ? 'http' : 'https';
  return `${scheme}://superadmin.${root}`;
}

/** `GET /impersonation/exit` — drop the impersonated session and leave. */
export function GET(req: NextRequest): NextResponse {
  const target = operatorConsoleUrl();
  const res = target
    ? NextResponse.redirect(new URL(target))
    : NextResponse.redirect(new URL(`${BASE_PATH}/login`, req.nextUrl.origin));

  for (const name of IMPERSONATION_COOKIES) {
    res.cookies.set(name, '', impersonationCookieOptions(0));
  }
  return res;
}
