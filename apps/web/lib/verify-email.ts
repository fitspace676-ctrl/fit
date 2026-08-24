// @fit/web — server-side email verification.
//
// Backs the `/member/verify` page the verification email links to. The API's
// `GET /auth/verify` both checks the single-use token and marks the address
// verified; the page only needs the outcome, so the token pair the API issues
// alongside is deliberately ignored — the member signs in through the normal
// door right after.

import { env } from './env';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/**
 * Redeem an email-verification token against the API. Resolves `'verified'`
 * when the API accepts it and `'invalid'` for everything else — an expired or
 * already-used token, a malformed one, or an unreachable API — because from
 * the page's side those all render the same "link no longer works" state.
 * Uncached: a verification token is single-use, so a cached answer is a wrong
 * answer.
 */
export async function verifyEmailToken(token: string): Promise<'verified' | 'invalid'> {
  try {
    const response = await fetch(`${API_URL}/auth/verify?token=${encodeURIComponent(token)}`, {
      cache: 'no-store',
    });
    return response.ok ? 'verified' : 'invalid';
  } catch {
    return 'invalid';
  }
}
