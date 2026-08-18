// @fit/admin — impersonation entry point.
//
// Where a platform operator lands when they press "Enter admin" in
// `@fit/superadmin`: `<slug>.<root>/admin/impersonation/start?code=…`. The code
// is single-use and lives about a minute; this route trades it for a gym-scoped
// OWNER session and puts the operator straight into the console.
//
// The exchange happens SERVER-SIDE, and the token it returns never reaches the
// browser as anything but an httpOnly cookie. That is the whole reason the
// handoff is a code rather than the token itself: what travels through the URL
// bar — and therefore through history, the referrer header, and every log
// between the two hosts — is worth nothing once redeemed.

import { NextResponse, type NextRequest } from 'next/server';
import type { ImpersonationExchangeResponse } from '@fit/types';
import { IMPERSONATION_TOKEN_COOKIE } from '@/lib/auth-session';
import {
  IMPERSONATION_META_COOKIE,
  impersonationCookieOptions,
  type ImpersonationMeta,
} from '@/lib/impersonation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** This app's basePath behind the tenant proxy — mirrors `middleware.ts`. */
const BASE_PATH = process.env.ADMIN_BASE_PATH ?? '/admin';

/** Base URL of the @fit/api backend. */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Absolute redirect resolved against the **tenant-facing** origin. Behind the
 * proxy this app runs on a `*.vercel.app` upstream while the operator is on
 * `<slug>.<root>`, so the origin is rebuilt from the forwarded headers — the same
 * reasoning as `middleware.ts`'s `redirectTo`.
 */
function redirectTo(req: NextRequest, path: string): NextResponse {
  const forwardedHost = req.headers.get('x-forwarded-host');
  const proto = req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', '');
  const origin = forwardedHost ? `${proto}://${forwardedHost}` : req.nextUrl.origin;
  return NextResponse.redirect(new URL(path, origin));
}

/** `GET /impersonation/start?code=…` — redeem the code and open the console. */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) {
    return redirectTo(req, `${BASE_PATH}/403`);
  }

  let session: ImpersonationExchangeResponse;
  try {
    const res = await fetch(`${API_URL}/auth/impersonation/exchange`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
      cache: 'no-store',
    });
    if (!res.ok) {
      // A spent, expired or forged code is not a signed-in operator, and there is
      // nothing useful to distinguish between those cases on screen.
      return redirectTo(req, `${BASE_PATH}/403`);
    }
    session = (await res.json()) as ImpersonationExchangeResponse;
  } catch {
    return redirectTo(req, `${BASE_PATH}/403`);
  }

  const meta: ImpersonationMeta = {
    gymName: session.gym.name,
    ownerEmail: session.ownerEmail,
    expiresAt: Math.floor(Date.now() / 1000) + session.expiresInSeconds,
  };

  // Both cookies expire with the token, so an impersonation cleans itself up
  // even if the operator simply closes the tab.
  const res = redirectTo(req, BASE_PATH);
  const options = impersonationCookieOptions(session.expiresInSeconds);
  res.cookies.set(IMPERSONATION_TOKEN_COOKIE, session.accessToken, options);
  res.cookies.set(IMPERSONATION_META_COOKIE, JSON.stringify(meta), options);
  return res;
}
