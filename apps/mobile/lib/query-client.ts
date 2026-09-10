// @fit/mobile — the app's single TanStack Query client, plus the two React
// Native bridges without which half of Query's defaults are inert.
//
// Two things the web gets for free and React Native does not:
//
//   - `refetchOnWindowFocus` is driven by `focusManager`, which on the web
//     listens to `visibilitychange`. There is no `document` in RN, so the
//     default focus manager never fires and the option is a silent no-op —
//     returning to the app from the background never refetches anything.
//   - `onlineManager` defaults to `navigator.onLine`, which RN does not
//     implement. Without a NetInfo bridge, Query believes it is always online
//     and fires requests into a dead radio, burning the retry budget on
//     failures that were never going to succeed and then reporting an error the
//     user reads as "the app is broken" rather than "you are offline".
//
// Both bridges are ~20 lines and non-negotiable (WP-3). They are wired through
// {@link wireQueryBridges}, which takes its platform modules as *arguments* so
// the wiring is unit-testable with fakes; {@link installReactNativeBridges} is
// the thin app-startup wrapper that supplies the real ones.

import { QueryClient, focusManager, onlineManager } from '@tanstack/react-query';
import { ApiError } from './http/api-error';

/** Attempts a failed query gets in total, including the first. */
export const MAX_QUERY_ATTEMPTS = 3;

/**
 * Whether a failed request is worth another attempt.
 *
 * Two rules, both about not making things worse:
 *
 *   - **Never retry a 4xx.** A 403 will never become a 200 — the caller lacks
 *     the permission, full stop — and a 404 will never become a 200 either. The
 *     worst case is 429: retrying a rate-limit response is precisely what the
 *     rate limiter is defending against, so three attempts turn a short
 *     cool-down into a longer one. (`apps/api`'s guard sets `Retry-After`; a
 *     caller that wants to honour it reads `ApiError.retryAfterSec` and
 *     schedules its own retry, rather than hammering the endpoint blind.)
 *   - **A 401 is never retried either.** By the time a query sees one, the
 *     client has already refreshed and retried once and then ended the session —
 *     retrying would just re-run a request with no token.
 *
 * 5xx and transport failures (`status: 0`) *are* retried: those are the cases a
 * second attempt genuinely fixes.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (failureCount >= MAX_QUERY_ATTEMPTS - 1) {
    return false;
  }
  if (ApiError.is(error) && error.isClientError) {
    return false;
  }
  return true;
}

/** Exponential backoff, capped so a flaky connection never stalls a screen. */
export function retryDelay(failureCount: number): number {
  return Math.min(1000 * 2 ** failureCount, 8000);
}

/**
 * Build a `QueryClient` with the app's shared defaults.
 *
 * A factory rather than only a singleton so tests (and any future
 * per-scenario harness) can get an isolated cache without touching the app's.
 */
export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: shouldRetry,
        retryDelay,
        // A mobile screen is re-entered constantly (tab switches, back
        // navigation); 30s of staleness turns that into cache reads instead of
        // a request storm, while still feeling live.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Meaningful only once `focusManager` is bridged to `AppState` below.
        refetchOnWindowFocus: true,
        refetchOnReconnect: true,
      },
      mutations: {
        // A mutation is not idempotent — a retried `POST /cart/checkout` can
        // create two orders. Retrying is opt-in, per mutation.
        retry: false,
      },
    },
  });
}

/**
 * The app's query cache.
 *
 * A module singleton because `endSession()` must be able to clear it from
 * outside React (`lib/auth/token-store.ts`), on a code path — the second 401 —
 * that has no component to hand it in. That is defect #3 from the deleted app:
 * its unauthorized handler only navigated to `/login`, leaving every gym-scoped
 * cache entry alive, so signing in as a different member rendered the previous
 * member's data until each query happened to refetch.
 */
export const queryClient: QueryClient = createQueryClient();

/** The subset of `AppState` the focus bridge uses. */
export interface AppStateLike {
  addEventListener(
    type: 'change',
    listener: (state: string) => void,
  ): { remove: () => void } | (() => void);
}

/** The subset of `@react-native-community/netinfo` the online bridge uses. */
export interface NetInfoLike {
  addEventListener(
    listener: (state: {
      isConnected: boolean | null;
      isInternetReachable?: boolean | null;
    }) => void,
  ): () => void;
}

/**
 * Decide whether a NetInfo state means "requests can succeed".
 *
 * `isInternetReachable` is preferred over `isConnected` when the platform
 * reports it: a phone attached to a captive-portal Wi-Fi is `isConnected: true`
 * and cannot reach the API, which is the single most common false-online on a
 * gym's guest network. `null` / `undefined` means "not yet determined" and is
 * treated as online — assuming offline before NetInfo has answered would block
 * the first request of every cold start behind a manager that never flips.
 */
export function isOnlineFromNetInfo(state: {
  isConnected: boolean | null;
  isInternetReachable?: boolean | null;
}): boolean {
  const reachable = state.isInternetReachable;
  if (reachable === null || reachable === undefined) {
    return state.isConnected !== false;
  }
  return reachable;
}

/**
 * Wire `focusManager` to app foreground/background and `onlineManager` to
 * NetInfo. Returns a teardown that removes both.
 *
 * Both managers take a *setup* function and keep the cleanup **it** returns
 * (`query-core`'s `setEventListener` calls the previous cleanup before
 * installing a new setup, and again on `onUnsubscribe`). So the platform
 * subscription is created inside the setup and disposed by the function that
 * setup returns — never captured outside it — and the teardown here simply
 * installs a no-op setup, which makes each manager run the cleanup it is
 * holding. `setEventListener` itself returns `void`; treating it as an
 * unsubscribe is a type error, and would have been a silent leak if it weren't.
 */
export function wireQueryBridges(deps: {
  appState: AppStateLike;
  netInfo: NetInfoLike;
}): () => void {
  focusManager.setEventListener((setFocused) => {
    const subscription = deps.appState.addEventListener('change', (state) => {
      setFocused(state === 'active');
    });
    return () => {
      if (typeof subscription === 'function') {
        subscription();
      } else {
        subscription.remove();
      }
    };
  });

  onlineManager.setEventListener((setOnline) =>
    deps.netInfo.addEventListener((state) => {
      setOnline(isOnlineFromNetInfo(state));
    }),
  );

  return () => {
    focusManager.setEventListener(() => undefined);
    onlineManager.setEventListener(() => undefined);
  };
}

/**
 * Supply {@link wireQueryBridges} with the real `AppState` and NetInfo. Called
 * once from the app's root layout.
 *
 * The two modules are pulled in through an *indirected* dynamic import so this
 * file never appears in the bundler-agnostic module graph of the unit suite:
 * `react-native` ships Flow-typed source Vitest cannot parse (§5), and the
 * moment a static `import 'react-native'` appears here, every spec that touches
 * a query key would have to move to the slow `jest-expo` runner.
 */
export async function installReactNativeBridges(): Promise<() => void> {
  // `require`, NOT `await import('react-native')`.
  //
  // Metro compiles a dynamic `import()` into `importAll`, which copies every
  // enumerable property off the module — and React Native's index is a wall of
  // lazy getters, one of which is the long-removed `PushNotificationIOS`. Merely
  // *reading* it constructs a `NativeEventEmitter` over a native module that no
  // longer exists and throws `\`new NativeEventEmitter()\` requires a non-null
  // argument`. The rejection surfaces far from here — it took the app down on
  // the first screen that awaited this, with a generic "something went wrong".
  //
  // `require` returns the same object without enumerating it, so only the one
  // getter we name is touched. The call still lives inside this function, so
  // `lib/` has no static `react-native` import and the Vitest suite (which never
  // calls this) stays renderer-free.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const rn = require('react-native') as { AppState: AppStateLike };
  const netInfoModule = '@react-native-community/netinfo';
  const netinfo = (await import(/* @vite-ignore */ netInfoModule)) as { default: NetInfoLike };
  return wireQueryBridges({ appState: rn.AppState, netInfo: netinfo.default });
}
