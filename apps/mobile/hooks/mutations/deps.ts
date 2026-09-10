// @fit/mobile — what every mutation needs from React, and nothing more.
//
// Each mutation in this package is written twice over: once as a pure
// `*MutationOptions(deps)` factory, and once as a three-line `use*()` wrapper
// that feeds it the gym scope and the query client. That split is the whole
// testing strategy — `invalidation.spec.ts` drives the factories' `onSuccess` /
// `onSettled` against a recording cache with no renderer, no `react-native`, and
// no `QueryClientProvider`, which is what keeps the invalidation matrix in the
// fast Vitest suite (§5).
//
// A screen imports only the `use*()` hook. It never sees `MutationDeps`, and it
// never imports from `lib/api/`.

import { useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useGymId } from '../useActiveGym';

/** Everything a mutation-options factory takes from the outside world. */
export interface MutationDeps {
  /**
   * The active gym, or `null` when signed out / still hydrating / signed in with
   * no active membership.
   *
   * Nullable on purpose: a hook is called unconditionally by the rules of hooks,
   * so the scope has to be representable as absent rather than asserted at
   * construction. {@link requireGymId} turns it into an error at *mutate* time,
   * which is the moment a user actually did something.
   */
  readonly gymId: string | null;
  /** The cache the matrix invalidates against. */
  readonly queryClient: QueryClient;
}

/**
 * Thrown when a mutation runs without a gym scope.
 *
 * Not an `ApiError`: no request was made. It means a screen rendered a mutating
 * control while signed out — a routing bug (`lib/route-policy.ts` decides which
 * zones need a session), so it should be loud rather than a silent no-op.
 */
export class MissingGymScopeError extends Error {
  constructor(action: string) {
    super(`${action} requires an active gym; none is in scope`);
    this.name = 'MissingGymScopeError';
    Object.setPrototypeOf(this, MissingGymScopeError.prototype);
  }
}

/** Narrow a nullable gym id, or throw {@link MissingGymScopeError}. */
export function requireGymId(gymId: string | null, action: string): string {
  if (gymId === null) {
    throw new MissingGymScopeError(action);
  }
  return gymId;
}

/** The dependencies for the current render. Used by every `use*` mutation hook. */
export function useMutationDeps(): MutationDeps {
  const gymId = useGymId();
  const queryClient = useQueryClient();
  return { gymId, queryClient };
}
