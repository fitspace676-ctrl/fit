// @fit/admin — the impersonated-session cookies and the values behind them.
//
// A platform operator entering this console from `@fit/superadmin` arrives with
// a single-use handoff code, which `/impersonation/start` exchanges for a
// gym-scoped OWNER token. That token and the few facts the banner needs are kept
// in two cookies, both **host-only** so they exist on exactly the one gym's host
// and nowhere else on the platform — see `IMPERSONATION_TOKEN_COOKIE` for why
// that isolation matters.

import { IMPERSONATION_TOKEN_COOKIE } from './auth-session';

/**
 * Companion cookie holding what the banner says: which gym, whose account, and
 * when the session runs out.
 *
 * Kept beside the token rather than derived from it because the token carries
 * ids, not names — reading it would tell the banner `gym-cmr97…`, and turning
 * that into "Downtown Strength" would mean an API call on every page of an
 * impersonated session. The exchange already returns the names once; this
 * remembers them. It is httpOnly like the token: nothing here is secret, but
 * nothing here is any use to client JS either.
 */
export const IMPERSONATION_META_COOKIE = 'impersonationMeta';

/** What the banner needs to name the session the operator is inside. */
export interface ImpersonationMeta {
  gymName: string;
  ownerEmail: string;
  /** Epoch seconds at which the token expires — the banner counts down to it. */
  expiresAt: number;
}

/** Parse the meta cookie, or `null` when absent or malformed. */
export function parseImpersonationMeta(raw: string | undefined): ImpersonationMeta | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<ImpersonationMeta>;
    if (
      typeof parsed.gymName === 'string' &&
      typeof parsed.ownerEmail === 'string' &&
      typeof parsed.expiresAt === 'number'
    ) {
      return {
        gymName: parsed.gymName,
        ownerEmail: parsed.ownerEmail,
        expiresAt: parsed.expiresAt,
      };
    }
  } catch {
    // Only `/impersonation/start` writes this; a malformed value means the
    // banner renders unnamed rather than the console failing to render.
  }
  return null;
}

/**
 * Shared options for both cookies.
 *
 * **No `domain`.** The ordinary session cookies are set on the parent domain so
 * one sign-in spans a gym's portal and console; an impersonation is the opposite
 * — it belongs to one host, must not be visible on any other tenant, and must
 * not survive as a session anywhere the operator did not deliberately enter.
 */
export function impersonationCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge,
  };
}

/** The two cookie names, for the routes that set and clear them together. */
export const IMPERSONATION_COOKIES = [IMPERSONATION_TOKEN_COOKIE, IMPERSONATION_META_COOKIE];
