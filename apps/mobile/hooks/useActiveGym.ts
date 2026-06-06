// @fit/mobile — the session's active gym scope.
//
// Member-facing reads (classes, bookings) are scoped to one gym. The mobile app
// has no separate gym-picker yet (that lands with multi-gym Settings, T6.8); the
// active gym is simply the `gymId` claim baked into the session's access token by
// the API at sign-in. This hook surfaces it reactively off `useAuth`, so a
// re-scoped session (a future gym switch re-issuing the token) repaints every
// consumer with no extra plumbing.

import { useMemo } from 'react';
import { decodeSessionClaims } from '../lib/jwt';
import { useAuth } from './useAuth';

/**
 * The active gym id for the signed-in session, or `null` when signed out, still
 * hydrating, or on a scopeless platform session (no gym membership). Gate any
 * gym-scoped query on a non-null value.
 */
export function useActiveGymId(): string | null {
  const { session } = useAuth();
  return useMemo(
    () => decodeSessionClaims(session?.accessToken)?.gymId ?? null,
    [session?.accessToken],
  );
}
