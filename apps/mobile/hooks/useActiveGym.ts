// @fit/mobile — the gym scope, and the only place a screen may get one.
//
// Every gym-scoped query key is `[resource, gymId, …]` (WP-3), and switching gym
// means re-login (D4). So there must be exactly one answer in the app to "which
// gym am I?", and it must come from the access token's `gymId` claim rather than
// from a prop, a route param or a remembered slug. A second source is how a key
// gets built under gym A while the session is gym B, which is a tenant data leak
// wearing a caching bug's clothes.
//
// `null` is a real answer, not an error: a signed-in user with no active gym
// membership gets a token with no `gymId` claim. Screens branch on it and render
// their own "no plan" state; the route guard ignores it entirely
// (`lib/route-policy.ts`).

import { useSyncExternalStore } from 'react';
import { getActiveGymSnapshot, subscribeSessionState, type ActiveGym } from '../lib/auth/session';

export type { ActiveGym } from '../lib/auth/session';

/**
 * The gym this session is scoped to, or `null` when signed out, still hydrating,
 * or signed in with no active membership.
 *
 * Reference-stable between session changes, so it is safe in a dependency array
 * and as a query-key input.
 */
export function useActiveGym(): ActiveGym | null {
  return useSyncExternalStore(subscribeSessionState, getActiveGymSnapshot, getActiveGymSnapshot);
}

/**
 * The gym id, or `null`. The value every `queryKeys.*(gymId)` call takes.
 *
 * A query whose key needs a gym must be disabled while this is `null` rather
 * than falling back to a placeholder — `['classes', undefined]` and
 * `['classes', 'gym_a']` are different cache buckets, and the first one is a
 * bucket two different tenants can both land in.
 */
export function useGymId(): string | null {
  return useActiveGym()?.gymId ?? null;
}
