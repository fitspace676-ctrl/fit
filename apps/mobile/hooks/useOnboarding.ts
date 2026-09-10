// @fit/mobile — the first-run flag, as React sees it.
//
// Same shape as `useSession`: one `useSyncExternalStore` over the store's own
// snapshot, no local copy, no navigation. `resolveRedirect` takes `isComplete`
// as its third argument, so this hook and that function are the two halves of
// the onboarding zone — one reactive, one pure.

import { useSyncExternalStore } from 'react';
import {
  getOnboardingSnapshot,
  setOnboardingComplete,
  subscribeOnboarding,
} from '../lib/auth/onboarding-store';
import { getSessionState, subscribeSessionState } from '../lib/auth/session';

/** What {@link useOnboarding} reports. */
export interface OnboardingState {
  /** Whether the intro has been completed on this install. */
  readonly isComplete: boolean;
  /**
   * Whether the persisted flag is still being read.
   *
   * Shares the session's hydration flag because `hydrateAuth()` loads both in
   * one pass — two independent "loading" flags would let the guard act on a
   * half-known state, which is the redirect flash it exists to prevent.
   */
  readonly isHydrating: boolean;
  /** Mark the intro done. Persisted, and published to every subscriber at once. */
  readonly complete: () => Promise<void>;
}

/**
 * The onboarding flag.
 *
 * `complete` is the store's own function, not a `useCallback` wrapper: it is
 * already module-level and therefore already reference-stable, and wrapping it
 * would only add a hook whose deps could go stale.
 */
export function useOnboarding(): OnboardingState {
  const isComplete = useSyncExternalStore(
    subscribeOnboarding,
    getOnboardingSnapshot,
    getOnboardingSnapshot,
  );
  const isHydrating =
    useSyncExternalStore(subscribeSessionState, getSessionState, getSessionState).status ===
    'hydrating';

  return { isComplete, isHydrating, complete: setOnboardingComplete };
}
