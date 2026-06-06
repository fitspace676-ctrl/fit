// @fit/mobile — the auth + onboarding route guard.
//
// Mounted once from the root layout, this is the single place that decides which
// "zone" the user is allowed in based on their session and onboarding state, and
// `router.replace`s them there. It implements the launch contract from T6.2:
//
//   no session              → the (auth) group (login / register / reset / verify)
//   session, not onboarded  → the onboarding screens
//   session, onboarded      → the (tabs) app shell
//
// Because both `session` and `isComplete` are reactive (useSyncExternalStore),
// the same effect that gates a cold launch also reacts to a live sign-in,
// sign-out, or "Get started" tap — no screen has to navigate on success itself.

import { useRouter, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useAuth } from './useAuth';
import { useOnboarding } from './useOnboarding';

/**
 * Enforce the auth + onboarding routing zones. Returns true while the initial
 * session / onboarding hydration is in flight, so the layout can hold a splash
 * and avoid a redirect flash before the persisted state is known.
 */
export function useProtectedRoute(): boolean {
  const { session, isLoading: authLoading } = useAuth();
  const { isComplete, isLoading: onboardingLoading } = useOnboarding();
  const segments = useSegments();
  const router = useRouter();

  // Hold off on any redirect until both persisted flags are loaded — otherwise a
  // launch with a valid session would briefly bounce through /login.
  const hydrating = authLoading || onboardingLoading;

  useEffect(() => {
    if (hydrating) return;

    // Route groups appear verbatim in the segment array, so the first segment is
    // the zone: '(auth)' for sign-in screens, 'onboarding' for the intro, and
    // '(tabs)' for the app shell. The bare entry route ('/') has no first
    // segment, so it falls through to whichever zone the state below dictates.
    const inAuthGroup = segments[0] === '(auth)';
    const inOnboarding = segments[0] === 'onboarding';
    const inTabs = segments[0] === '(tabs)';

    if (!session) {
      // Signed out: only the (auth) group is reachable. Deep links carrying a
      // verify / reset token land there too, so they're allowed through.
      if (!inAuthGroup) router.replace('/login');
    } else if (!isComplete) {
      // Signed in but first-run: force the onboarding screens.
      if (!inOnboarding) router.replace('/onboarding');
    } else if (!inTabs) {
      // Fully onboarded: the app shell is the only valid zone, so bounce in from
      // the entry route or out of the auth / onboarding screens.
      router.replace('/classes');
    }
  }, [hydrating, session, isComplete, segments, router]);

  return hydrating;
}
