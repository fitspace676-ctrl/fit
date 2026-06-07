// @fit/mobile — reactive notification preferences.
//
// Reads the AsyncStorage-backed snapshot in `notification-prefs` via
// `useSyncExternalStore`, so every consumer (the Settings screen and the
// notifications screen) re-renders the instant a toggle flips. Hydrates the
// snapshot from AsyncStorage exactly once per app launch, shared across consumers
// — the same one-shot pattern `useAuth` uses for the keychain.

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  getPrefsSnapshot,
  hydratePrefs,
  subscribePrefs,
  updatePrefs,
  type NotificationPrefs,
} from '../lib/notification-prefs';

// Shared one-shot hydration: AsyncStorage is read once per launch no matter how
// many components mount this hook.
let hydration: Promise<unknown> | null = null;
function ensureHydrated(): Promise<unknown> {
  if (!hydration) hydration = hydratePrefs();
  return hydration;
}

export interface UseNotificationPrefs {
  /** The current preferences (defaults until the first hydration resolves). */
  prefs: NotificationPrefs;
  /** True while the initial AsyncStorage hydration is in flight. */
  isLoading: boolean;
  /** Merge a partial update and persist it. */
  setPrefs: (patch: Partial<NotificationPrefs>) => Promise<NotificationPrefs>;
  /** Flip a single boolean preference. */
  toggle: (key: keyof NotificationPrefs) => Promise<NotificationPrefs>;
}

/** Drive notification preferences from any screen. */
export function useNotificationPrefs(): UseNotificationPrefs {
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getPrefsSnapshot);
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
    prefs,
    isLoading,
    setPrefs: updatePrefs,
    toggle: (key) => updatePrefs({ [key]: !prefs[key] }),
  };
}
