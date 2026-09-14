'use server';

// @fit/web — the member-portal listing reads, with the session forwarded.
//
// `GET /products`, `/class-instances`, `/services` and `/trainers` are public, but
// they narrow to a signed-in member's HOME branch when the request carries the
// member's bearer token (decision D7; `PortalBranchService` in the API). The token
// lives in the httpOnly `accessToken` cookie, which browser code cannot read — and
// must not be handed to it — so the call runs here, on the server:
//
//  - a Server Component calls {@link requestPortalListing} as a plain function;
//  - a client island (`ShopBrowser`, `ClassesBrowser`, …) reaches the same function
//    as a server action, which reads the cookie off its own request.
//
// A signed-in member's answer is per-user, so the request is always `no-store`: it
// never lands in a shared fetch cache where another visitor could be served it.
// Only the four listing paths are accepted — this is not a general API proxy.

import { cookies } from 'next/headers';
import { ACCESS_TOKEN_COOKIE } from './auth-session';
import { tenantHeaders } from './tenant-headers';

/** Base URL of the @fit/api backend (inlined at build via NEXT_PUBLIC_*). */
const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** The listings that narrow to a member's home branch. */
const LISTINGS = ['products', 'class-instances', 'services', 'trainers'] as const;

/** One of the portal listing endpoints. */
export type PortalListing = (typeof LISTINGS)[number];

/** The raw outcome of a listing read; the caller parses `body` with its own schema. */
export interface PortalListingResponse {
  status: number;
  body: unknown;
}

/**
 * `GET /<listing>?<query>` against the API, with the tenant host and — when a
 * member is signed in — their `Authorization: Bearer` token. An anonymous visitor
 * sends no token and gets every branch.
 */
export async function requestPortalListing(
  listing: PortalListing,
  query: Record<string, string>,
): Promise<PortalListingResponse> {
  if (!LISTINGS.includes(listing)) {
    throw new Error(`Unknown portal listing: ${String(listing)}`);
  }

  const token = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const params = new URLSearchParams(query);
  const response = await fetch(`${API_URL}/${listing}?${params.toString()}`, {
    method: 'GET',
    headers: {
      ...(await tenantHeaders()),
      Accept: 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    cache: 'no-store',
  });

  const body = (await response.json().catch(() => null)) as unknown;
  return { status: response.status, body };
}
