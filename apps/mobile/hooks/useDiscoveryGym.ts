// @fit/mobile — **which gym a signed-out visitor is reading.** One seam, one copy.
//
// ===========================================================================
// THE GAP THIS CLOSES
//
// `useActiveGym.ts` is the single authority on the tenant, and deliberately so:
// every gym-scoped key is `[resource, gymId, …]`, switching gym means re-login,
// and a second source of `gymId` is how a key gets built under gym A inside a
// session for gym B. That reasoning is sound and this file does not weaken it.
//
// What it does not cover is the case where there is no session at all. Half the
// app is `@Public()` on the API and `'public'` in `ROUTE_POLICY` — classes,
// trainers, services, service sessions, products, packages, locations and the
// join catalogue — and every one of those endpoints takes an **explicit `gymId`
// query parameter, precisely so a visitor with no token can read it**. But
// `useGymId()` answers `null` signed out, `gymScope(null)` returns
// `enabled: false`, and the query never runs: the screen sits on a skeleton
// forever with nothing on the wire.
//
// The app already had the missing half. `resolveGymSlug()` (deep link → build
// config → last successful login, D4) plus the `@Public()`
// `GET /gyms/by-subdomain/:slug` answers a `gymId` before a session exists —
// it is what the login screen uses to name the gym. This hook is that pair,
// behind the session's own answer.
//
// ---------------------------------------------------------------------------
// WHY IT IS ONE FILE AND NOT THREE
//
// Four work packages hit this wall independently and each solved it locally:
// `components/classes/use-discovery-gym.ts` (C3a), `components/services/
// discovery-gym.ts` (C3b), `app/(join)/checkout.tsx` driving the checkout
// mutation's `gymId` by hand (C4b), and the shop, which gated itself behind
// sign-in rather than work around it (C4a). Three copies of one rule is how
// drift starts, and they had already drifted: C3a's version ran the public
// lookup **even when signed in** (a wasted request on every mount of the
// classes tab, and a second, disagreeing answer sitting in the cache), C3b's
// called the same state `isResolving` where C3a called it `isPending`, and only
// C3a carried a `retry()`. This file is the union of what they got right.
//
// ---------------------------------------------------------------------------
// THE RULES, STATED ONCE
//
//   1. **The session wins outright.** When the token carries a `gymId` claim it
//      is the answer, no lookup runs, and no request is made. A member browsing
//      their own gym's trainers must never be shown another tenant's roster
//      because a stale build slug points elsewhere.
//   2. **No slug is an error, not a wait.** A build with no `gymSlug` and no
//      session has nothing to look up and nothing to wait for, so the screen
//      renders its error branch immediately rather than spinning forever.
//   3. **Retry is `invalidateQueries`, never `.refetch()`.** The invalidation
//      matrix is the deliverable; a screen that refetches by hand is a screen
//      that can disagree with it. Invalidating an active, errored query
//      refetches it, which is exactly what a retry is.
//   4. **`gymId` is nullable and that is a real state**, not an error to
//      assert away — the rules of hooks mean this is called unconditionally,
//      before anything is known.
//
// A screen imports this and nothing else for its tenant. It never reaches into
// `lib/api/**`, and it never calls `getGymBySubdomain` itself.

import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';

import type { MutationDeps } from './mutations/deps';
import { useGymBySlug } from './queries/useGym';
import { useGymId } from './useActiveGym';
import { resolveGymSlug } from '../lib/auth/session';
import { queryKeys } from '../lib/query-keys';

/** The three states a caller renders, plus the id it scopes reads by. */
export interface DiscoveryGym {
  /** The gym to read as, or `null` while it is unknown or unreachable. */
  readonly gymId: string | null;
  /** The public lookup is in flight and is the only route to an id. */
  readonly isPending: boolean;
  /** There is no tenant to browse: no slug, or the lookup failed. */
  readonly isError: boolean;
  /** Re-run the tenant lookup. Safe to call when there is nothing to re-run. */
  retry: () => void;
}

/** Just the parts of the public lookup {@link resolveDiscoveryGym} reads. */
export interface TenantLookup {
  /** The id the lookup answered, or `null` while it has not. */
  readonly gymId: string | null;
  readonly isPending: boolean;
  readonly isError: boolean;
}

/** {@link DiscoveryGym} minus the callback — the part that is pure. */
export type DiscoveryGymState = Omit<DiscoveryGym, 'retry'>;

/**
 * The whole decision, as a function of three inputs.
 *
 * Extracted so it is testable in the **renderer-free** Vitest lane (§5) rather
 * than only through a mounted screen: the branch that matters most — "signed in
 * costs no request" — is a property of this function, and asserting it here
 * means it cannot regress behind a mock.
 */
export function resolveDiscoveryGym(
  sessionGymId: string | null,
  slug: string | null,
  lookup: TenantLookup,
): DiscoveryGymState {
  // Rule 1. The claim is authoritative and terminal — the lookup is not even
  // consulted, so a stale or wrong cached answer cannot leak past it.
  if (sessionGymId !== null) {
    return { gymId: sessionGymId, isPending: false, isError: false };
  }
  // Rule 2. Nothing to ask, so nothing to wait for.
  if (slug === null) {
    return { gymId: null, isPending: false, isError: true };
  }
  return { gymId: lookup.gymId, isPending: lookup.isPending, isError: lookup.isError };
}

/**
 * The gym a public screen reads: the access-token claim when signed in, the
 * slug-resolved tenant otherwise.
 *
 * @example
 * const gym = useDiscoveryGym();
 * const roster = useQuery(trainersQueryOptions(gym.gymId));
 * if (gym.isError) return <Error onRetry={gym.retry} />;
 */
export function useDiscoveryGym(): DiscoveryGym {
  const sessionGymId = useGymId();
  const queryClient = useQueryClient();
  // A plain read of module state, not a hook — safe during render, and the same
  // call the login screen makes.
  const slug = resolveGymSlug() ?? null;
  // `null` disables the query. Rule 1 in the data layer rather than only in the
  // return value: signed in, this costs zero requests.
  const lookup = useGymBySlug(sessionGymId === null ? slug : null);

  const retry = useCallback(() => {
    if (slug === null) return;
    void queryClient.invalidateQueries({ queryKey: queryKeys.gymBySlug(slug) });
  }, [queryClient, slug]);

  const state = resolveDiscoveryGym(sessionGymId, slug, {
    gymId: lookup.data?.gymId ?? null,
    isPending: lookup.isPending,
    isError: lookup.isError,
  });

  return { ...state, retry };
}

/** Just the id, for a caller with no loading or error branch of its own. */
export function useDiscoveryGymId(): string | null {
  return useDiscoveryGym().gymId;
}

/**
 * {@link MutationDeps} scoped by the discovery gym rather than by the session.
 *
 * **The join funnel needs this and `useMutationDeps()` cannot serve it.** That
 * hook reads `gymId` from the access-token claim *captured at render*. A
 * signed-out buyer has no claim, and the re-render that `saveTokens` triggers
 * has not happened by the time `signUpMember()` resolves — so `requireGymId`
 * throws `MissingGymScopeError` on the very `POST /checkout` the public funnel
 * exists to make. The discovery gym is the same tenant (it is in the signup
 * body), known *before* the signup, and stable across it.
 *
 * Signed in it is identical to `useMutationDeps()` by rule 1, so a call site
 * does not have to choose between them per session state.
 */
export function useDiscoveryMutationDeps(): MutationDeps {
  const { gymId } = useDiscoveryGym();
  const queryClient = useQueryClient();
  return useMemo(() => ({ gymId, queryClient }), [gymId, queryClient]);
}
