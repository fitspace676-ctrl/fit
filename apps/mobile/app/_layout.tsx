// Root layout.
//
// `global.css` must be imported here, once, at the top of the tree — it is what
// `withNativeWind` compiles into the React Native style runtime, so without it
// every `className` on the tree below silently resolves to nothing.
import '../global.css';

import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useCallback, useEffect, type ReactElement } from 'react';

import { AppProviders, RouteGuard, useAppBootstrap } from '../providers';
import { AppFeatureScreen } from '../providers/AppFeaturesProvider';

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
 * ## Why the screens wait for the fonts even though the navigator does not
 *
 * The navigator is mounted on the first frame; the SCREENS inside it are not,
 * until `useFormacoreFonts()` has settled. A screen mounted before the faces
 * are registered lays out every `NotoSansGeorgian-*` / `JetBrainsMono-*` run
 * against the system fallback, and nothing re-measures it when the fonts land:
 * the text's props never change, so no new layout is committed and the cached
 * measurement stays. On a cold start that was every time — a thin title on
 * onboarding and a bold button label measured in the fallback's advances and
 * then clipped ("გაგრძელ…") on checkout. A warm app never showed it because the
 * faces were already registered in the process.
 *
 * `screenLayout` wraps each root route's scene, so gating there keeps the
 * navigation state — including a cold deep link's route — while holding back
 * only the content. Nested navigators live inside those scenes, so the gate
 * covers them too. A font ERROR also opens it: the app then draws with the
 * system family, as it always has on that branch.
 *
 * ## Why the guard is a sibling rather than a wrapper
 *
 * It has to be inside the navigation context to call `useSegments()`, and it has
 * to render nothing. A sibling of `Stack` under the providers is both.
 */
export default function RootLayout() {
  const { ready, fonts } = useAppBootstrap();
  const fontsSettled = fonts.loaded || fonts.error !== null;

  // A new function when the gate flips is what makes the navigator re-render
  // its descriptors and mount the scene it has been holding.
  const screenLayout = useCallback(
    ({ children }: { children: ReactElement }): ReactElement =>
      fontsSettled ? <AppFeatureScreen>{children}</AppFeatureScreen> : <></>,
    [fontsSettled],
  );

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
      <Stack screenOptions={{ headerShown: false }} screenLayout={screenLayout}>
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
