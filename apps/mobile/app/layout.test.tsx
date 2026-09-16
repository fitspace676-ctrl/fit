// The root layout's two contracts, and both of them are launch-blocking bugs
// when they are wrong.
//
// 1. THE SPLASH IS HELD UNTIL THE FONTS HAVE LOADED **OR ERRORED**.
//    `useFonts` settles on `[false, Error]` for a corrupt or missing asset and
//    then never changes again, so a gate written as `if (loaded)` keeps the
//    splash up FOREVER on that device. RN falls back to the system family for an
//    unregistered name, so the errored branch is a slightly wrong-looking app —
//    which is unambiguously better than no app. The two tests below are the same
//    test twice, once per branch, because a gate that is right on the happy path
//    is exactly how this ships.
//
// 2. THE NAVIGATOR IS MOUNTED EVEN WHILE THE SPLASH IS UP.
//    The obvious shape — `if (!ready) return null` — deadlocks: `RouteGuard`
//    calls `router.replace`, and the router has no navigation state until a
//    navigator has mounted. So the tree is always mounted and the splash is what
//    hides the un-decided frame.

// Type-only, for the `jest.requireActual` type arguments below: the repo's
// preset forbids inline `import()` type annotations.
import type * as ReactModule from 'react';
import type * as ReactNativeModule from 'react-native';
import { screen, waitFor } from '@testing-library/react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { View } from 'react-native';

import { renderApp } from '../test-support/render';
import RootLayout from './_layout';

// `Stack` is a navigator; under a test renderer it is a marker. The point of the
// test is that it is RENDERED, not what it draws.
jest.mock('expo-router', () => {
  // `jest.requireActual` is `any` without a type argument, and one `any` in a
  // factory spreads through every arrow it returns.
  const { View: RNView } = jest.requireActual<typeof ReactNativeModule>('react-native');
  const React = jest.requireActual<typeof ReactModule>('react');
  const Stack = (props: Record<string, unknown>) =>
    React.createElement(RNView, { testID: 'root-stack', ...props });
  // `Stack.Screen` is a CONFIG element: react-navigation reads its props off the
  // element and never renders it, so the stub only has to exist and carry them.
  // Without this the root layout dies on `undefined.displayName` the moment it
  // declares a screen — which is what shipped when `/qr` gained its `modal`
  // presentation and nine tests in this file went red at once.
  Stack.Screen = (props: Record<string, unknown>) =>
    React.createElement(RNView, { testID: `root-screen-${String(props.name)}`, ...props });
  return {
    Stack,
    useRouter: () => ({ replace: jest.fn(), push: jest.fn(), back: jest.fn() }),
    useSegments: () => [] as string[],
    usePathname: () => '/',
    useGlobalSearchParams: () => ({}),
  };
});

// The keychain read. It never rejects in production — an unreadable keychain is
// a signed-out launch, not a hung app — so the only interesting axis here is
// WHEN it resolves, which each test controls.
const mockHydrateAuth = jest.fn<Promise<unknown>, []>();

jest.mock('../lib/auth/session', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/auth/session'),
  hydrateAuth: (): Promise<unknown> => mockHydrateAuth(),
}));

const mockInstallBridges = jest.fn<Promise<() => void>, []>(() => Promise.resolve(() => undefined));

jest.mock('../lib/query-client', () => ({
  ...jest.requireActual<Record<string, unknown>>('../lib/query-client'),
  installReactNativeBridges: (): Promise<() => void> => mockInstallBridges(),
}));

const hide = SplashScreen.hideAsync as jest.Mock;
const prevent = SplashScreen.preventAutoHideAsync as jest.Mock;
// Captured HERE, at the test module's own top level, because the call it records
// happens while `./_layout` is being imported — before any `beforeEach` runs, and
// therefore before `jest.clearAllMocks()` wipes it. Asserting it inside a test
// would only ever prove that nothing called it since the last reset.
const PREVENTED_AT_IMPORT = prevent.mock.calls.length;
// `jest.setup.ts` reports "loaded" by default; the errored branch overrides it.
const fonts = useFonts as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockHydrateAuth.mockResolvedValue(undefined);
  fonts.mockReturnValue([true, null]);
});

describe('RootLayout', () => {
  it('holds the splash from module scope, before the first render', () => {
    // An effect is too late: by the time one runs the splash has already
    // auto-hidden and the launch flash has happened. Importing the module is
    // what has to have called it, which is why this assertion needs no render.
    expect(PREVENTED_AT_IMPORT).toBe(1);
  });

  it('mounts the navigator immediately — the splash, not `null`, hides the frame', () => {
    // Never resolves: the app is still hydrating for the whole test.
    mockHydrateAuth.mockReturnValue(new Promise(() => undefined));
    renderApp(<RootLayout />);

    // Present even though nothing is ready. Returning `null` here is the
    // deadlock: no navigator, so the guard's first `replace` goes nowhere.
    expect(screen.getByTestId('root-stack')).toBeTruthy();
    expect(hide).not.toHaveBeenCalled();
  });

  it('declares `/qr` as a modal — the one screen this stack names', () => {
    // The scanner is pushed from the capsule's centre action and has to come up
    // OVER the tab it was opened from, so the tab stays mounted and stays
    // selected underneath. Without `presentation: 'modal'` it replaces the
    // shell full screen and the only way back is the close button.
    mockHydrateAuth.mockReturnValue(new Promise(() => undefined));
    renderApp(<RootLayout />);

    const qr = screen.getByTestId('root-screen-qr');
    expect(qr.props.options).toEqual({ presentation: 'modal' });
  });

  it('hides the splash once hydration and the fonts have both landed', async () => {
    renderApp(<RootLayout />);

    await waitFor(() => {
      expect(hide).toHaveBeenCalledTimes(1);
    });
  });

  it('hides it on an ERRORED font load too — the branch that hangs the app', async () => {
    // `[false, Error]` is `useFonts`' terminal answer for a corrupt asset. It
    // never moves again, so gating on `loaded` alone is an app that never
    // starts.
    fonts.mockReturnValue([false, new Error('font asset missing')]);
    renderApp(<RootLayout />);

    await waitFor(() => {
      expect(hide).toHaveBeenCalledTimes(1);
    });
    expect(screen.getByTestId('root-stack')).toBeTruthy();
  });

  it('does NOT hide it while the fonts are still in flight', async () => {
    fonts.mockReturnValue([false, null]);
    renderApp(<RootLayout />);

    // Give the hydration promise every chance to land; the font gate is still
    // open, so the splash must stay up.
    await waitFor(() => {
      expect(mockInstallBridges).toHaveBeenCalled();
    });
    expect(hide).not.toHaveBeenCalled();
  });

  it('does NOT hide it while the keychain read is still outstanding', async () => {
    mockHydrateAuth.mockReturnValue(new Promise(() => undefined));
    renderApp(<RootLayout />);

    await waitFor(() => {
      expect(mockInstallBridges).toHaveBeenCalled();
    });
    expect(hide).not.toHaveBeenCalled();
  });

  it('hides it exactly once, however many times the tree re-renders', async () => {
    const view = renderApp(<RootLayout />);

    await waitFor(() => {
      expect(hide).toHaveBeenCalledTimes(1);
    });

    view.rerender(<RootLayout />);
    view.rerender(<RootLayout />);

    // The effect is keyed on `ready`, which does not change again — a hide per
    // render would fight the OS animation on every state change during launch.
    expect(hide).toHaveBeenCalledTimes(1);
  });

  it('survives a native splash module that is not there', async () => {
    // A bare Expo Go on an unsupported platform rejects both calls. A failed
    // splash is a cosmetic regression; taking the app down over it is not.
    hide.mockRejectedValueOnce(new Error('no native module'));

    expect(() => renderApp(<RootLayout />)).not.toThrow();
    await waitFor(() => {
      expect(hide).toHaveBeenCalled();
    });
  });

  it('renders the children the providers are given — the tower is real', async () => {
    // A smoke test for the provider order: `useI18n` throws outside its
    // provider and `useSafeAreaInsets` outside `SafeAreaProvider`, so anything
    // mis-nested fails here rather than on a device.
    renderApp(
      <View testID="probe-host">
        <RootLayout />
      </View>,
    );

    await waitFor(() => {
      expect(hide).toHaveBeenCalled();
    });
    expect(screen.getByTestId('probe-host')).toBeTruthy();
  });
});
