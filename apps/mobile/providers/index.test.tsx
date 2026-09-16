// The launch gate and the route guard.
//
// ## Why the guard has a test file of its own
//
// It is the ONLY place in the app that navigates on session state. No screen
// calls `router.replace` after a sign-in — the session store flips, this
// component sees it, and the redirect follows. That is what makes
// `resolveRedirect`'s zone table the single readable description of where a user
// may be, instead of a table plus five screens' worth of `.then()` handlers,
// which is how the deleted app's table was wrong for months with nothing failing.
//
// `resolveRedirect` itself is pure and has its own Vitest table in
// `lib/route-policy.spec.ts`. What is asserted HERE is the wiring the pure
// function cannot see: that the guard actually calls the router, that it calls it
// with the table's answer, and that the ONE thing it adds on top — closing the
// `?next=` round trip it opened itself — is applied to exactly one cell and is
// safe against an open redirect.

import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react-native';
import { useFonts } from 'expo-font';
import { Text } from 'react-native';

import type { SessionState } from '../lib/auth/session';
import { AppProviders, RouteGuard, safeNextPath, useAppBootstrap } from './index';

const mockReplace = jest.fn();
const mockPush = jest.fn();

// Everything the guard reads from the router, in one mutable box the tests set.
// `mock`-prefixed because a `jest.mock` factory is hoisted above the imports.
const mockRoute: {
  segments: string[];
  pathname: string;
  params: { next?: string };
} = { segments: [], pathname: '/', params: {} };

// `useRouter()` returns a STABLE object, exactly as expo-router's own does. It
// is a dependency of the guard's effect, so a fresh object per render would
// re-run the effect on every commit — which would make the "does not re-issue
// the same redirect" test below pass or fail on a property of the MOCK rather
// than of the guard.
//
// Built on FIRST USE rather than in the factory body: the factory runs when
// `expo-router` is first required, which is while `./index` is being imported —
// before `const mockReplace = jest.fn()` has executed. Capturing the spies
// eagerly would freeze `undefined` into the object.
jest.mock('expo-router', () => {
  let router: { replace: unknown; push: unknown; back: unknown } | null = null;
  return {
    useRouter: () => (router ??= { replace: mockReplace, push: mockPush, back: jest.fn() }),
    useSegments: () => mockRoute.segments,
    usePathname: () => mockRoute.pathname,
    useGlobalSearchParams: () => mockRoute.params,
  };
});

const SIGNED_OUT: SessionState = {
  status: 'signed-out',
  userId: null,
  gymId: null,
  role: null,
  expiresAt: null,
};

const HYDRATING: SessionState = { ...SIGNED_OUT, status: 'hydrating' };

const SIGNED_IN: SessionState = {
  status: 'signed-in',
  userId: 'usr_1',
  gymId: 'gym_1',
  role: 'MEMBER',
  expiresAt: 4_102_444_800_000,
};

const mockSession: { current: SessionState } = { current: HYDRATING };
const mockOnboarded = { current: true };

jest.mock('../hooks/useSession', () => ({
  useSession: () => mockSession.current,
}));

jest.mock('../hooks/useOnboarding', () => ({
  useOnboarding: () => ({
    isComplete: mockOnboarded.current,
    isHydrating: false,
    complete: jest.fn(),
  }),
}));

const mockHydrateAuth = jest.fn<Promise<unknown>, []>();

jest.mock('../lib/auth/session', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/auth/session'),
  hydrateAuth: (): Promise<unknown> => mockHydrateAuth(),
}));

const mockDispose = jest.fn();
const mockInstallBridges = jest.fn<Promise<() => void>, []>(() => Promise.resolve(mockDispose));

jest.mock('../lib/query-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/query-client'),
  installReactNativeBridges: (): Promise<() => void> => mockInstallBridges(),
}));

// The keychain backend. `token-store` takes it by injection (§5 — the module has
// to stay in the fast Vitest suite), so *something* must install it, and for a
// while nothing did: `getSecureStorage()` throws by design rather than degrading
// to an in-memory map, so the app booted, rendered `/login`, got a real token
// pair back from the API, and then died in `saveTokens` on "Secure storage is
// not installed" — surfacing as the generic sign-in error, for every password.
const mockInstallSecureStore = jest.fn();

jest.mock('../lib/auth/token-store', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/auth/token-store'),
  installExpoSecureStore: (): void => {
    // Braced, not a concise body: `jest.fn()` returns `any`, and returning it
    // from a `: void` arrow is `no-unsafe-return`.
    mockInstallSecureStore();
  },
}));

const fonts = useFonts as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockRoute.segments = [];
  mockRoute.pathname = '/';
  mockRoute.params = {};
  mockSession.current = HYDRATING;
  mockOnboarded.current = true;
  mockHydrateAuth.mockResolvedValue(undefined);
  fonts.mockReturnValue([true, null]);
});

// ─────────────────────────────────────────────────────────────────────────────

describe('safeNextPath', () => {
  it('accepts a same-origin absolute path', () => {
    expect(safeNextPath('/shop/cart')).toBe('/shop/cart');
    expect(safeNextPath('/classes?day=2026-08-31')).toBe('/classes?day=2026-08-31');
  });

  it('rejects everything that could leave the app', () => {
    // The `next=` value round-trips through a URL the user can edit and, on a
    // phone, through a deep link anyone can send. `//evil.com` is a
    // protocol-relative URL and `/\evil.com` is the backslash variant some
    // parsers normalise into one — both turn sign-in into an open redirect, and
    // on mobile into a way to hand a freshly-minted session to a page the
    // attacker controls.
    expect(safeNextPath('//evil.com')).toBeNull();
    expect(safeNextPath('/\\evil.com')).toBeNull();
    expect(safeNextPath('https://evil.com')).toBeNull();
    expect(safeNextPath('javascript:alert(1)')).toBeNull();
    expect(safeNextPath('home')).toBeNull();
  });

  it('rejects a non-string, an empty string, and an absent value', () => {
    // `useGlobalSearchParams` hands back `string | string[] | undefined`, so the
    // array case is reachable from a link that repeats the parameter.
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath('')).toBeNull();
    expect(safeNextPath(['/shop'])).toBeNull();
    expect(safeNextPath(42)).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('RouteGuard', () => {
  it('renders nothing — it is a sibling of the navigator, not a wrapper', () => {
    // It has to be inside the navigation context to call `useSegments()`, and it
    // has to draw nothing. Wrapping the `Stack` would give it a tree to own.
    const view = render(<RouteGuard />);
    expect(view.toJSON()).toBeNull();
  });

  it('navigates nowhere while the session is hydrating', () => {
    // `hydrating` is not `signed-out`. Treating it as one is the
    // returning-member-sees-a-flash-of-login bug, on every cold start.
    mockRoute.segments = ['(tabs)', 'home'];
    mockRoute.pathname = '/home';
    render(<RouteGuard />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('bounces a signed-out user off an `auth` route, carrying the way back', () => {
    mockSession.current = SIGNED_OUT;
    mockRoute.segments = ['(tabs)', 'home'];
    mockRoute.pathname = '/home';
    render(<RouteGuard />);

    expect(mockReplace).toHaveBeenCalledWith('/login?next=%2Fhome');
  });

  it('leaves a signed-out user alone inside `(auth)`', () => {
    mockSession.current = SIGNED_OUT;
    mockRoute.segments = ['(auth)', 'login'];
    mockRoute.pathname = '/login';
    render(<RouteGuard />);

    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('sends a signed-in first-run user to the intro', () => {
    mockSession.current = SIGNED_IN;
    mockOnboarded.current = false;
    mockRoute.segments = ['(tabs)', 'home'];
    mockRoute.pathname = '/home';
    render(<RouteGuard />);

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('sends a signed-in, onboarded user out of `(auth)` to home', () => {
    mockSession.current = SIGNED_IN;
    mockRoute.segments = ['(auth)', 'login'];
    mockRoute.pathname = '/login';
    render(<RouteGuard />);

    expect(mockReplace).toHaveBeenCalledWith('/home');
  });

  it('closes the `?next=` round trip it opened — and only inside `(auth)`', () => {
    // `resolveRedirect` is pure and knows only segments, so its zone-3 answer is
    // a flat `/home`. But the guard is what WROTE the `?next=` when it bounced
    // this user here, so it is the half that has to honour it.
    mockSession.current = SIGNED_IN;
    mockRoute.segments = ['(auth)', 'login'];
    mockRoute.pathname = '/login';
    mockRoute.params = { next: '/shop/cart' };
    render(<RouteGuard />);

    expect(mockReplace).toHaveBeenCalledWith('/shop/cart');
  });

  it('ignores `next` on any cell of the table but that one', () => {
    // A `next` on the onboarding redirect would let a deep link skip the intro,
    // which is the one screen that must not be escapable.
    mockSession.current = SIGNED_IN;
    mockOnboarded.current = false;
    mockRoute.segments = ['(auth)', 'login'];
    mockRoute.pathname = '/login';
    mockRoute.params = { next: '/shop/cart' };
    render(<RouteGuard />);

    expect(mockReplace).toHaveBeenCalledWith('/onboarding');
  });

  it('falls back to home when `next` is hostile', () => {
    for (const next of ['//evil.com', '/\\evil.com', 'https://evil.com', '']) {
      jest.clearAllMocks();
      mockSession.current = SIGNED_IN;
      mockRoute.segments = ['(auth)', 'login'];
      mockRoute.pathname = '/login';
      mockRoute.params = { next };
      const view = render(<RouteGuard />);

      expect(mockReplace).toHaveBeenCalledWith('/home');
      view.unmount();
    }
  });

  it('does not re-issue the same redirect on an unrelated re-render', () => {
    mockSession.current = SIGNED_IN;
    mockRoute.segments = ['(auth)', 'login'];
    mockRoute.pathname = '/login';
    const view = render(<RouteGuard />);

    expect(mockReplace).toHaveBeenCalledTimes(1);

    // Nothing in the effect's dependency list changed, so a re-render must not
    // fire a second `replace` into a navigator that is already acting on the
    // first — which on a real stack is a double push.
    view.rerender(<RouteGuard />);
    expect(mockReplace).toHaveBeenCalledTimes(1);
  });

  it('reacts to the session flipping, without any screen asking it to', () => {
    // This is the whole contract: sign-in happens somewhere else, the store
    // changes, and the guard is what moves the user.
    mockSession.current = SIGNED_OUT;
    mockRoute.segments = ['(auth)', 'login'];
    mockRoute.pathname = '/login';
    const view = render(<RouteGuard />);
    expect(mockReplace).not.toHaveBeenCalled();

    mockSession.current = SIGNED_IN;
    view.rerender(<RouteGuard />);
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('useAppBootstrap', () => {
  it('is not ready until the keychain read has landed', async () => {
    mockHydrateAuth.mockReturnValue(new Promise(() => undefined));
    const { result } = renderHook(() => useAppBootstrap());

    expect(result.current.ready).toBe(false);
    expect(result.current.hydrated).toBe(false);
    // The bridges are wiring, not data — installed, never gated on.
    await waitFor(() => {
      expect(mockInstallBridges).toHaveBeenCalledTimes(1);
    });
    expect(result.current.ready).toBe(false);
  });

  it('is ready once hydration and a successful font load have both landed', async () => {
    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.fonts).toEqual({ loaded: true, error: null });
  });

  it('is ready on an ERRORED font load — `loaded || error`, never `loaded` alone', async () => {
    // `useFonts` settles on `[false, Error]` for a corrupt or missing asset and
    // then never changes again. A gate on `loaded` alone is a splash that never
    // comes down, on exactly the devices that can least afford it.
    const boom = new Error('font asset missing');
    fonts.mockReturnValue([false, boom]);
    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(result.current.fonts).toEqual({ loaded: false, error: boom });
  });

  it('is not ready while the fonts are genuinely still loading', async () => {
    fonts.mockReturnValue([false, null]);
    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.hydrated).toBe(true);
    });
    expect(result.current.ready).toBe(false);
  });

  it('installs the keychain backend BEFORE anything reads the keychain', async () => {
    // Order, not just presence. `hydrateAuth()` reads through the backend and
    // `saveTokens()` writes through it; installed late — or not at all — the
    // first symptom is a sign-in that fails after the API has already issued a
    // perfectly good token pair.
    renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(mockHydrateAuth).toHaveBeenCalled();
    });
    expect(mockInstallSecureStore).toHaveBeenCalledTimes(1);
    // `noUncheckedIndexedAccess` types these as `number | undefined`, and the
    // ordering claim is only meaningful once both calls have actually happened
    // — so assert that first rather than asserting a comparison against
    // `undefined`, which would pass vacuously if either never ran.
    const installedAt = mockInstallSecureStore.mock.invocationCallOrder[0];
    const hydratedAt = mockHydrateAuth.mock.invocationCallOrder[0];
    expect(installedAt).toBeDefined();
    expect(hydratedAt).toBeDefined();
    expect(installedAt as number).toBeLessThan(hydratedAt as number);
  });

  it('still boots when the keychain backend cannot be installed', async () => {
    // Holding the splash over it would be the `fonts.loaded` mistake again: no
    // app and no message. The failure is reported and stepped over, so it
    // surfaces at its point of use with the store's own explicit error.
    const consoleError = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    mockInstallSecureStore.mockImplementationOnce(() => {
      throw new Error('no keychain here');
    });

    const { result } = renderHook(() => useAppBootstrap());

    await waitFor(() => {
      expect(result.current.ready).toBe(true);
    });
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('tears the bridges down on unmount, and after a race', async () => {
    const { unmount } = renderHook(() => useAppBootstrap());
    await waitFor(() => {
      expect(mockInstallBridges).toHaveBeenCalled();
    });

    unmount();
    await waitFor(() => {
      expect(mockDispose).toHaveBeenCalledTimes(1);
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('AppProviders', () => {
  it('mounts the tower in an order every consumer survives', () => {
    // `useSafeAreaInsets` outside `SafeAreaProvider` throws, `useI18n` outside
    // its provider throws by design, and `ToastProvider` reads both the theme
    // and `t()`. So a mis-ordered tower fails here rather than on a device.
    render(
      <AppProviders>
        <Text testID="child">ok</Text>
      </AppProviders>,
    );

    // `SafeAreaProvider` renders NOTHING until it knows its insets, and the
    // native `onInsetsChange` that would tell it never fires under a test
    // renderer. `test-support/render.tsx` sidesteps that with `initialMetrics`;
    // `AppProviders` is the real tower and takes no such prop, so the event is
    // delivered by hand. Its absence is also the whole reason the harness seeds
    // metrics — without either, every screen test would assert against an empty
    // tree and pass for the wrong reason.
    expect(screen.queryByTestId('child')).toBeNull();

    fireEvent(screen.root, 'insetsChange', {
      nativeEvent: {
        frame: { x: 0, y: 0, width: 390, height: 844 },
        insets: { top: 47, left: 0, right: 0, bottom: 34 },
      },
    });

    expect(screen.getByTestId('child')).toBeTruthy();
  });
});
