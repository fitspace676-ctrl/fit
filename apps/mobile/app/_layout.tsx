// Root layout.
//
// `global.css` must be imported here, once, at the top of the tree — it is what
// `withNativeWind` compiles into the React Native style runtime, so without it
// every `className` on the tree below silently resolves to nothing.
import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useEffect } from 'react';

import { AppProviders, RouteGuard, useAppBootstrap } from '../providers';

// Called at module scope, before the first render, because by the time an effect
// runs the splash has already auto-hidden and the launch flash has happened. It
// returns a promise that rejects if the native module is unavailable (a bare
// Expo Go on an unsupported platform); a failed *prevent* is a cosmetic
// regression, not a reason to take the app down, so it is swallowed.
void SplashScreen.preventAutoHideAsync().catch(() => undefined);

/**
 * The app shell: providers, the guard, the navigator.
 *
 * ## Why the `Stack` is rendered even while the splash is up
 *
 * The obvious shape — `if (!ready) return null` — deadlocks. `RouteGuard` calls
 * `router.replace`, and the router has no navigation state until a navigator has
 * mounted; returning `null` means no navigator, which means the first redirect
 * after hydration is issued into a router that cannot act on it. So the tree is
 * always mounted and the *splash* is what hides the un-decided frame, which is
 * also exactly what a splash is for.
 *
 * ## Why the guard is a sibling rather than a wrapper
 *
 * It has to be inside the navigation context to call `useSegments()`, and it has
 * to render nothing. A sibling of `Stack` under the providers is both.
 */
export default function RootLayout() {
  const { ready } = useAppBootstrap();

  useEffect(() => {
    if (!ready) return;
    // `ready` is `hydrated && (fonts.loaded || fonts.error !== null)`. The
    // second half is the one that matters: gating on `loaded` alone leaves the
    // splash up FOREVER on a device where one font asset failed to unpack,
    // because `useFonts` settles on `[false, Error]` and never moves again.
    void SplashScreen.hideAsync().catch(() => undefined);
  }, [ready]);

  return (
    <AppProviders>
      <RouteGuard />
      <Stack screenOptions={{ headerShown: false }}>
        {/* ================================================================
            THE ONLY NAMED SCREEN IN THIS STACK, and it is named for ONE
            option. Every other route here comes from the file system with
            the defaults above; declaring one does not opt the rest out.

            `/qr` is pushed from the capsule's centre action and must come up
            OVER the tab it was opened from — the tab stays mounted, stays
            selected, and is what the member returns to. `presentation:
            'modal'` is what gives it the sheet transition and the swipe-down
            dismiss on iOS; without it the scanner replaces the shell full
            screen and the only way back is the screen's own close button.
            ================================================================ */}
        <Stack.Screen name="qr" options={{ presentation: 'modal' }} />
      </Stack>
    </AppProviders>
  );
}
