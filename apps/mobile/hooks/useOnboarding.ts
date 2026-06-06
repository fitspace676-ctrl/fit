// @fit/mobile — reactive first-run onboarding flag.
//
// Mirrors `useAuth`: reads the onboarding flag from the SecureStore-backed
// snapshot in `auth-storage` via `useSyncExternalStore` (so the route guard
// re-renders the instant the user finishes onboarding) and hydrates that
// snapshot from SecureStore exactly once per app launch, shared across every
// consumer.

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getOnboardingSnapshot,
  hydrateOnboarding,
  setOnboardingComplete,
  subscribeOnboarding,
} from '../lib/auth-storage';

// Shared one-shot hydration: SecureStore is read once per launch no matter how
// many components mount `useOnboarding`.
let hydration: Promise<unknown> | null = null;
function ensureHydrated(): Promise<unknown> {
  if (!hydration) hydration = hydrateOnboarding();
  return hydration;
}

export interface UseOnboarding {
  /** True once the user has completed (or skipped past) the onboarding screens. */
  isComplete: boolean;
  /** True while the initial SecureStore hydration is in flight. */
  isLoading: boolean;
  /** Persist completion and flip the flag everywhere (called on "Get started"). */
  complete: () => Promise<void>;
}

/**
 * Read the reactive onboarding flag. Gate the onboarding screens on `isComplete`
 * once `isLoading` is false; call `complete()` when the user finishes the flow.
 */
export function useOnboarding(): UseOnboarding {
  const isComplete = useSyncExternalStore(
    subscribeOnboarding,
    getOnboardingSnapshot,
    getOnboardingSnapshot,
  );
  const [isLoading, setIsLoading] = useState(hydration === null);

  useEffect(() => {
    let active = true;
    void ensureHydrated().finally(() => {
      if (active) setIsLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  return {
    isComplete,
    isLoading,
    complete: setOnboardingComplete,
  };
}
