// @fit/mobile — how a query hook survives having no gym yet.
//
// `useActiveGym` is the single authority on the tenant, and it answers `null`
// three different ways: while the session is hydrating, when signed out, and
// when signed in with no active membership. All three are real states a screen
// renders, not errors — so every gym-scoped hook is called unconditionally (the
// rules of hooks leave no choice) and *disabled* until a gym exists.
//
// A key still has to be built for a disabled query, and `queryKeys.*` takes a
// `string`. {@link UNSCOPED} is that placeholder. It is safe only because
// `enabled: false` guarantees nothing is ever written under it: no request runs,
// so no tenant's data can land in a bucket another tenant would also read. The
// moment a hook here forgets its `enabled` guard, that guarantee is gone — which
// is why the guard is expressed once, in {@link gymScope}, and asserted in the
// spec rather than repeated by hand in a dozen files.

/**
 * The gym-id placeholder for a query that has no gym yet.
 *
 * Not a valid gym id (ids are non-empty), so it can never collide with a real
 * tenant's bucket even if a future refactor did populate it.
 */
export const UNSCOPED = '';

/** A gym id and whether a query scoped by it may run. */
export interface GymScope {
  /** The id, or {@link UNSCOPED}. Safe to pass to any `queryKeys.*` factory. */
  readonly gymId: string;
  /** `false` while there is no gym — the `enabled` every gym-scoped query needs. */
  readonly enabled: boolean;
}

/** Resolve a nullable gym id into a key input plus its `enabled` flag. */
export function gymScope(gymId: string | null): GymScope {
  return { gymId: gymId ?? UNSCOPED, enabled: gymId !== null };
}
