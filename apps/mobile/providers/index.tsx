// @fit/mobile — the provider stack, the launch gate, and the route guard.
//
// Three things the root layout needs and none of them belong inline in it, so
// they live here where each is separately testable:
//
//   * {@link AppProviders} — the context tower, in the one order that works.
//   * {@link useAppBootstrap} — what the splash is waiting for.
//   * {@link RouteGuard} — the ONLY place in the app that navigates on session
//     state. No screen calls `router.replace` after a sign-in; the session store
//     flips, this component sees it, and the redirect follows. That is what
//     makes `resolveRedirect`'s zone table the single description of where a
//     user may be, instead of a table plus five screens' worth of `.then()`.

import { ToastProvider, useFormacoreFonts, type FontLoadState } from '@fit/ui-mobile';
import { QueryClientProvider } from '@tanstack/react-query';
import { useGlobalSearchParams, usePathname, useRouter, useSegments } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { hydrateAuth, reportSessionException } from '../lib/auth/session';
import { installExpoSecureStore } from '../lib/auth/token-store';
import { installReactNativeBridges, queryClient } from '../lib/query-client';
import { AUTH_GROUP, HOME_ROUTE, resolveRedirect } from '../lib/route-policy';
import { useOnboarding } from '../hooks/useOnboarding';
import { useSession } from '../hooks/useSession';
import { bootThemePreference } from '../lib/theme-preference';
import { I18nProvider } from './I18nProvider';
import { ThemePreferenceProvider } from './ThemePreferenceProvider';

// ─────────────────────────────────────────────────────────────────────────────
// The stack
// ─────────────────────────────────────────────────────────────────────────────

export interface AppProvidersProps {
  children: ReactNode;
}

/**
 * The context tower. The order is not arbitrary:
 *
 *   1. `SafeAreaProvider` — outermost, because `Screen`, `AppBar`,
 *      `FloatingTabBar` and `ToastProvider` all read insets, and a
 *      `useSafeAreaInsets()` outside a provider throws rather than defaulting.
 *   2. `ThemePreferenceProvider` — the kit's `ThemeProvider` with the member's
 *      light/dark choice wired into it. Everything below draws with
 *      `useThemeColors()`, including the toast host, so it has to be above the
 *      toast. It renders its subtree on the first frame (dark, synchronously);
 *      the persisted choice arrives from the same boot promise
 *      {@link useAppBootstrap} holds the splash on, so nothing below ever sees
 *      the mode change mid-flight.
 *   3. `QueryClientProvider` — above i18n only because nothing about i18n needs
 *      Query; the constraint that matters is that it is above every screen.
 *      It takes the module singleton from `lib/query-client.ts`, NOT a fresh
 *      client: `endSession()` clears that exact instance from outside React on
 *      the second-401 path, and a second client would leave the previous
 *      member's gym-scoped cache alive behind a new session.
 *   4. `I18nProvider` — above `ToastProvider` because a toast message is copy
 *      and copy comes from `t()`.
 *   5. `ToastProvider` — innermost, so it renders its host above the tree it
 *      serves.
 */
export function AppProviders({ children }: AppProvidersProps) {
  return (
    <SafeAreaProvider>
      <ThemePreferenceProvider>
        <QueryClientProvider client={queryClient}>
          <I18nProvider>
            <ToastProvider>{children}</ToastProvider>
          </I18nProvider>
        </QueryClientProvider>
      </ThemePreferenceProvider>
    </SafeAreaProvider>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// The launch gate
// ─────────────────────────────────────────────────────────────────────────────

/** What {@link useAppBootstrap} reports, so the caller can log the font error. */
export interface BootstrapState {
  /** Every gate has answered. The splash may be hidden. */
  readonly ready: boolean;
  /** The keychain / onboarding-flag read has resolved. */
  readonly hydrated: boolean;
  /** The persisted light/dark choice has been read. */
  readonly themed: boolean;
  /** `expo-font`'s answer, including a failed load. */
  readonly fonts: FontLoadState;
}

/**
 * Everything the splash is held for, in one hook.
 *
 * Two gates, and the second one has a trap in it:
 *
 *   1. **`installExpoSecureStore()`, then `hydrateAuth()`** — the keychain
 *      read, the onboarding flag, the device id and the remembered gym slug, in
 *      one pass. Until it resolves the session reports `hydrating` and
 *      {@link RouteGuard} redirects nowhere, so showing the tree before it lands
 *      is exactly the cold-launch flash of `/login` that the `hydrating` status
 *      exists to prevent. It never rejects — an unreadable keychain is a
 *      signed-out launch, not a hung app.
 *
 *      The install runs FIRST, synchronously, not merely alongside. `token-store` takes its backend by injection so the module
 *      stays in the fast Vitest suite (§5), and `getSecureStorage()` throws
 *      rather than degrading to an in-memory map — so with no backend installed
 *      the app boots, renders, and then fails the FIRST WRITE: `hydrateAuth()`
 *      swallows its own read failure and reports `signed-out`, `/login` renders
 *      normally, and `signIn()` gets a real token pair from the API and then
 *      dies in `saveTokens()` on "Secure storage is not installed". Every
 *      password on that screen looked wrong. Nothing else in the app called
 *      this, which is why it has to be here, above the gate that waits on it.
 *
 *   2. **`useFormacoreFonts()` — LOADED *OR* ERRORED.** Gating on `loaded`
 *      alone is an app that never starts: `useFonts` resolves `[false, Error]`
 *      for a corrupt or missing asset and then never changes again, so the
 *      splash stays up forever on a device where one font file failed to
 *      unpack. RN falls back to the system family for an unregistered name, so
 *      the errored branch is a slightly wrong-looking app — which is
 *      unambiguously better than no app.
 *
 *   3. **`bootThemePreference()`** — the persisted light/dark choice. A third
 *      gate for one AsyncStorage read, because the alternative is visible: the
 *      tree renders dark on the first frame by definition (the preference is
 *      not known yet), so hiding the splash before the read lands is a member
 *      who chose light watching the app flash dark and repaint. The promise is
 *      memoised and `ThemePreferenceProvider` awaits the same one, so this is a
 *      gate on a read that was going to happen anyway, not a second one. It
 *      never rejects — an unreadable store is a dark app, not a hung splash.
 *
 * The Query bridges (`focusManager` ↔ AppState, `onlineManager` ↔ NetInfo) are
 * installed here rather than gated on: they are wiring, not data, and nothing
 * on the first frame depends on them having landed.
 */
/**
 * Where a failed startup step goes.
 *
 * Two sinks because neither alone is enough: `reportSessionException` is the
 * app's real telemetry seam, but its default reporter is a no-op until the root
 * layout installs Sentry — so today it records nothing a developer can read.
 * The console reaches Metro's log and LogBox, which is where the failure is
 * actually noticed while it is still cheap to fix.
 */
function reportBootFailure(scope: string, error: unknown): void {
  console.error(`[bootstrap] ${scope} failed`, error);
  reportSessionException(scope, error);
}

export function useAppBootstrap(): BootstrapState {
  const [hydrated, setHydrated] = useState(false);
  const [themed, setThemed] = useState(false);
  const fonts = useFormacoreFonts();

  useEffect(() => {
    let cancelled = false;
    let teardown: (() => void) | null = null;

    void installReactNativeBridges()
      .then((dispose) => {
        if (cancelled) {
          dispose();
          return;
        }
        teardown = dispose;
      })
      .catch((error: unknown) => {
        // Without a `catch` this is an unhandled rejection, which on Hermes is a
        // red LogBox over the first screen and, in production, a Sentry-less
        // silent loss of the focus/online bridges. They are wiring, not data —
        // the app is usable without them — so it is reported, not fatal.
        reportBootFailure('queryBridges.install', error);
      });

    // FIRST, and synchronously: `hydrateAuth()` reads the keychain through this
    // backend, and `saveTokens()` writes through it on every sign-in. Its
    // failure is reported and then *stepped over*: an app that cannot reach the
    // keychain is badly broken, but holding the splash forever over it is the
    // same mistake as gating on `fonts.loaded` alone — the user gets no app at
    // all and no message. Stepping over lets the failure surface at its point of
    // use, with the store's own explicit error, rather than as a black screen.
    try {
      installExpoSecureStore();
    } catch (error) {
      reportBootFailure('secureStore.install', error);
    }

    void hydrateAuth().then(() => {
      if (!cancelled) {
        setHydrated(true);
      }
    });

    // Same promise `ThemePreferenceProvider` is waiting on — the memo in
    // `lib/theme-preference.ts` makes this a join, not a second read. Its
    // *value* is the provider's business; all the splash needs is that it has
    // landed, so the frame it uncovers is already in the member's own mode.
    void bootThemePreference().then(() => {
      if (!cancelled) {
        setThemed(true);
      }
    });

    return () => {
      cancelled = true;
      teardown?.();
    };
  }, []);

  return {
    ready: hydrated && themed && (fonts.loaded || fonts.error !== null),
    hydrated,
    themed,
    fonts,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// The route guard
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Is `raw` a path we are willing to send the user to after sign-in?
 *
 * The `next=` value round-trips through a URL the user can edit and, on a phone,
 * through a deep link anyone can send. Same rule the web member portal applies
 * to its `from=`: a same-origin absolute path only. `//evil.com` is a
 * protocol-relative URL and `/\evil.com` is the backslash variant some parsers
 * normalise into one — both would turn the sign-in flow into an open redirect,
 * and on mobile into a way to hand a freshly-signed-in session to a page the
 * attacker controls.
 */
export function safeNextPath(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (!raw.startsWith('/')) return null;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/**
 * The one component that navigates on session state.
 *
 * Renders nothing. It is mounted as a sibling of the `Stack` in the root layout
 * — not wrapped around it — so it can read `useSegments()` (which needs the
 * navigation context) without owning the tree.
 *
 * ## Why `next=` is honoured HERE and not on the login screen
 *
 * `resolveRedirect` is pure and knows only segments, so its zone-3 answer for an
 * `(auth)` route is a flat `/home`. But the guard is also what WROTE the
 * `?next=` in zone 1, when it bounced a signed-out user off an `auth` route —
 * so it is the half of the round trip that has to close it. Doing it on the
 * login screen instead would mean the screen navigates on sign-in, which is
 * precisely the shape that made the old guard untestable: routing decisions
 * spread across five screens' `.then()` handlers with no table to read.
 *
 * The override applies to exactly one cell of the table — signed in, onboarded,
 * inside `(auth)` — and falls back to `/home` whenever `next` is absent or fails
 * {@link safeNextPath}.
 */
export function RouteGuard() {
  const segments = useSegments();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ next?: string }>();
  const session = useSession();
  const { isComplete } = useOnboarding();
  const router = useRouter();

  const next = params.next;

  useEffect(() => {
    const target = resolveRedirect(segments, session, isComplete, { pathname });
    if (target === null) return;

    const destination =
      target === HOME_ROUTE && segments[0] === AUTH_GROUP ? (safeNextPath(next) ?? target) : target;

    router.replace(destination);
  }, [segments, pathname, next, session, isComplete, router]);

  return null;
}
