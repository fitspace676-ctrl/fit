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
  clampActiveLocation,
  locationFilter,
  resolveActiveLocation,
  type BranchAccess,
  type LocationRef,
} from './active-location';
import { branchAccess, permittedLocations } from './console-permissions';
import { getConsolePermissions } from './permissions-server';
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
 * empty roster.
 *
 * What an empty roster MEANS now depends on the operator, and that is the change
 * branch scope brought. For a gym-wide role it still degrades to "all locations"
 * — the filter is a convenience for them, not a boundary. For a role scoped to
 * its assigned branches it degrades the other way, to `NO_LOCATION`: they have no
 * branch to fall back to, and "every branch" is precisely the answer their scope
 * exists to withhold. See {@link fetchPermittedLocations}.
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
 * The branches this operator may actually work in — {@link fetchActiveLocations}
 * narrowed by their role's branch scope.
 *
 * A role scoped to `assigned` sees only the branches it holds `LocationStaff`
 * rows for; a gym-wide role sees the whole roster. Memoised alongside the roster
 * itself so the layout (which populates the switcher) and every page (which
 * validates the cookie) share one answer and one round trip.
 *
 * This is what every other function in this file resolves against, so a branch
 * the operator may not use is not merely hidden from the switcher — it is not a
 * value the cookie or the URL can name.
 */
export const fetchPermittedLocations = cache(async (): Promise<AdminLocation[]> => {
  const [locations, permissions] = await Promise.all([
    fetchActiveLocations(),
    getConsolePermissions(),
  ]);
  return permittedLocations(permissions, locations);
});

/** How much of the gym this request's operator may look at. */
export const getBranchAccess = cache(async (): Promise<BranchAccess> => {
  const [locations, permissions] = await Promise.all([
    fetchActiveLocations(),
    getConsolePermissions(),
  ]);
  return branchAccess(permissions, locations);
});

/**
 * The branch this request is scoped to, as the UI spells it: `ALL_LOCATIONS`, a
 * live location id, or `NO_LOCATION`. Use this to seed the client provider; use
 * {@link getActiveLocationId} to filter a fetch.
 *
 * Two passes, deliberately. {@link resolveActiveLocation} answers what the
 * request asked for and whether the gym has it; {@link clampActiveLocation} then
 * answers whether this operator may have it. Collapsing them would mean the
 * cookie resolver had to know about permissions, and separating them is what lets
 * the second pass be the same function the browser runs.
 *
 * **The clamp is why the URL is not a way around the scope.** Both candidate
 * sources are untrusted input — a cookie survives a change of role, and a
 * `?locationId=` is whatever was pasted into the address bar — so neither is
 * taken at its word. A restricted operator naming a colleague's branch lands on
 * one of their own; with no branches at all they land on `NO_LOCATION`, which
 * filters everything out rather than falling open to the gym.
 *
 * Layouts are not handed `searchParams` by the App Router, so the console layout
 * calls this with nothing and the URL override is reconciled on the client, where
 * `useSearchParams()` can see it — see `components/active-location.tsx`. The two
 * sides run the same two passes over the same two inputs, so they agree.
 */
export async function getActiveLocation(searchParams?: SearchParamsInput): Promise<string> {
  const [param, jar, locations, access] = await Promise.all([
    locationParam(searchParams),
    cookies(),
    fetchPermittedLocations(),
    getBranchAccess(),
  ]);
  return clampActiveLocation(
    resolveActiveLocation(param, jar.get(ACTIVE_LOCATION_COOKIE)?.value, locations),
    access,
  );
}

/**
 * The `locationId` to send to the API for this request, or `undefined` for "all
 * branches". One line at the top of a page is the whole integration:
 *
 * ```ts
 * const locationId = await getActiveLocationId(searchParams);
 * const data = await fetchMembers({ ...query, locationId });
 * ```
 *
 * For an operator restricted to assigned branches this is never `undefined`: it
 * is one of their branches, or `NO_LOCATION` when they hold none. "All branches"
 * is a gym-wide answer and they do not have one.
 */
export async function getActiveLocationId(
  searchParams?: SearchParamsInput,
): Promise<string | undefined> {
  return locationFilter(await getActiveLocation(searchParams));
}
