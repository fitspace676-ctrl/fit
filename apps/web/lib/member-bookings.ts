// @fit/web — member booking-history API helper.
//
// Unlike the public class-discovery reads (`lib/classes.ts`), the member panel's
// booking history (`GET /me/bookings`, T5.10) is an *authenticated* call: the API
// resolves the member from the JWT, so this helper forwards the `accessToken`
// cookie as the `Authorization: Bearer` header the API's `TenantMiddleware`
// expects. It is therefore server-only — it reads `next/headers` cookies — and
// the page that calls it is auth-gated by the web middleware, so an absent token
// is treated as "no bookings to show" rather than a crash.

import { cookies } from 'next/headers';
import {
  listMemberBookingsResultSchema,
  type MemberBookingHistoryEntry,
  type MemberBookingScope,
} from '@fit/types';
import { ACCESS_TOKEN_COOKIE } from './auth-session';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** Arguments for {@link fetchMemberBookings}. */
export interface FetchMemberBookingsArgs {
  /** Which slice to load; defaults to the member's full history (`all`). */
  scope?: MemberBookingScope;
  /** Abort signal so an in-flight request is cancelled if the caller unmounts. */
  signal?: AbortSignal;
}

/**
 * Fetch the signed-in member's bookings for the panel's "My bookings" page.
 * Forwards the `accessToken` cookie as a bearer token to `GET /me/bookings` and
 * returns the parsed, validated entries.
 *
 * Returns an empty array when there is no session token (the auth middleware
 * should have redirected first, so this is a belt-and-braces guard) and when the
 * API answers `401`/`403` — both mean "nothing to show this caller" rather than
 * an error screen. Any other non-OK status throws, as does a malformed payload.
 */
export async function fetchMemberBookings({
  scope = 'all',
  signal,
}: FetchMemberBookingsArgs = {}): Promise<MemberBookingHistoryEntry[]> {
  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  if (!token) {
    return [];
  }

  const params = new URLSearchParams({ scope });
  const response = await fetch(`${API_URL}/me/bookings?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  });

  // The caller isn't (or is no longer) a member this token can read — treat as an
  // empty history rather than surfacing a 401/403 as a thrown error.
  if (response.status === 401 || response.status === 403) {
    return [];
  }

  if (!response.ok) {
    const detail = (await response.json().catch(() => null)) as { message?: string } | null;
    throw new Error(detail?.message ?? `Failed to load bookings (${response.status})`);
  }

  return listMemberBookingsResultSchema.parse(await response.json()).bookings;
}
