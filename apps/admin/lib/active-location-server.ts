// @fit/admin — reading the active branch on the server.
//
// The counterpart to `lib/active-location.ts`, split out for exactly one reason:
// this file imports `next/headers`, and the switcher imports the constants and
// the pure resolver from the other one. A `'use client'` module that pulls in
// `next/headers`, even transitively, fails to build — so the shared vocabulary
// has to live in a module that touches neither the cookie jar nor the API. Same
// split the console already makes between `lib/auth-session.ts` (shared) and
// `lib/session.ts` (server-only, reads `cookies()`); there is no `lib/server/`
// directory to put it in, and inventing one for a single file would be a bigger
// change than the naming.
//
// Server-only. A Client Component that needs the active branch reads it from
// `components/active-location.tsx`'s context instead.

import { cache } from 'react';
import { cookies } from 'next/headers';
import {
  ACTIVE_LOCATION_COOKIE,
  LOCATION_PARAM,
  locationFilter,
  resolveActiveLocation,
  type LocationRef,
} from './active-location';
import { fetchLocations } from './api';

/** A gym location as the console chrome and the resolver need it. */
export interface AdminLocation extends LocationRef {
  id: string;
  name: string;
}

/**
 * A page's `searchParams`, in either of the shapes Next hands out: the Promise a
 * Page component receives under the App Router, or a plain object once awaited.
 * Accepting both means a caller can forward the prop straight through.
 */
export type SearchParamsInput =
  | Record<string, string | string[] | undefined>
  | Promise<Record<string, string | string[] | undefined>>
  | undefined;

/**
 * The gym's live branches, fetched at most once per server render.
 *
 * Memoised with React's `cache()` rather than fetched per caller: the console
 * layout needs this list to populate the switcher and every page needs it to
 * validate the cookie, and both render inside the same request pass. Without the
 * memo, wiring the filter into ~25 pages would add ~25 round trips per page view.
 * (`fetchLocations` is `cache: 'no-store'`, so Next's own fetch dedup does not
 * cover it.)
 *
 * Never throws: a caller lacking `location:read`, or an API that is down, gets an
 * empty roster — which degrades every stored branch to "all locations". That is
 * the fail-*open* behaviour the location filter is specified to have (it is a
 * convenience, not an authorization boundary — see the roadmap's Stage 8).
 */
export const fetchActiveLocations = cache(async (): Promise<AdminLocation[]> => {
  try {
    const res = await fetchLocations({ status: 'ACTIVE', limit: 100 });
    return res.data.map((location) => ({ id: location.id, name: location.name }));
  } catch {
    return [];
  }
});

/** Pull `?locationId=` out of a page's search params, tolerating a repeated key. */
async function locationParam(searchParams: SearchParamsInput): Promise<string | undefined> {
  const params = await searchParams;
  const raw = params?.[LOCATION_PARAM];
  return Array.isArray(raw) ? raw[0] : raw;
}

/**
 * The branch this request is scoped to, as the UI spells it: `ALL_LOCATIONS` or
 * a live location id. Use this to seed the client provider; use
 * {@link getActiveLocationId} to filter a fetch.
 *
 * Layouts are not handed `searchParams` by the App Router, so the console layout
 * calls this with nothing and the URL override is reconciled on the client, where
 * `useSearchParams()` can see it — see `components/active-location.tsx`.
 */
export async function getActiveLocation(searchParams?: SearchParamsInput): Promise<string> {
  const [param, jar, locations] = await Promise.all([
    locationParam(searchParams),
    cookies(),
    fetchActiveLocations(),
  ]);
  return resolveActiveLocation(param, jar.get(ACTIVE_LOCATION_COOKIE)?.value, locations);
}

/**
 * The `locationId` to send to the API for this request, or `undefined` for "all
 * branches". One line at the top of a page is the whole integration:
 *
 * ```ts
 * const locationId = await getActiveLocationId(searchParams);
 * const data = await fetchMembers({ ...query, locationId });
 * ```
 */
export async function getActiveLocationId(
  searchParams?: SearchParamsInput,
): Promise<string | undefined> {
  return locationFilter(await getActiveLocation(searchParams));
}
