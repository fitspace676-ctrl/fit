// The entry route, `/`, and the one thing it must never do.
//
// `ROUTE_POLICY['']` is `'public'` on purpose, so a cold launch does not bounce
// through `/login` before the keychain read resolves. That makes
// `resolveRedirect` answer `null` here for EVERY session state, which is why the
// dispatch is this screen's own job rather than the guard's — the one place in
// the app where a screen decides a destination, and it is written down in
// `route-policy.ts` in as many words.
//
// The failure mode being pinned: treating `hydrating` as `signed-out`. It is a
// one-word change, it looks harmless, and it puts a frame of the login screen in
// front of every returning member on every cold start.

// Type-only, for the `jest.requireActual` type arguments below: the repo's
// preset forbids inline `import()` type annotations.
import type * as ReactModule from 'react';
import type * as ReactNativeModule from 'react-native';
import { render, screen } from '@testing-library/react-native';
import { View } from 'react-native';

import type { SessionState } from '../lib/auth/session';
import Index from './index';

// `Redirect` renders nothing real; here it is a marker carrying its `href`, so a
// test can assert the destination without a navigator.
jest.mock('expo-router', () => {
  // Typed: an untyped `jest.requireActual` is `any`, and `React.createElement`
  // on an `any` is three lint errors rather than one.
  const React = jest.requireActual<typeof ReactModule>('react');
  const { View: RNView } = jest.requireActual<typeof ReactNativeModule>('react-native');
  return {
    Redirect: ({ href }: { href: string }) =>
      React.createElement(RNView, { testID: 'redirect', accessibilityLabel: href }),
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

/** The `href` the screen redirected to, or `null` if it redirected nowhere. */
function destination(): string | null {
  const marker = screen.queryByTestId('redirect');
  return marker === null ? null : String(marker.props.accessibilityLabel);
}

beforeEach(() => {
  mockSession.current = HYDRATING;
  mockOnboarded.current = true;
});

describe('the entry route', () => {
  it('draws nothing and goes nowhere while the session is hydrating', () => {
    const view = render(<Index />);

    // The loading state of this route IS the splash: `useAppBootstrap` holds it
    // over exactly this window, so a spinner here would paint a frame nobody can
    // see and would need a "Loading…" string no namespace carries.
    expect(view.toJSON()).toBeNull();
    expect(destination()).toBeNull();
  });

  it('sends a signed-out user to sign-in', () => {
    mockSession.current = SIGNED_OUT;
    render(<Index />);

    expect(destination()).toBe('/login');
  });

  it('sends a signed-in first-run user to the intro, not home', () => {
    mockSession.current = SIGNED_IN;
    mockOnboarded.current = false;
    render(<Index />);

    // The same order `resolveRedirect` uses, so the two can never disagree about
    // which of the two post-sign-in destinations wins.
    expect(destination()).toBe('/onboarding');
  });

  it('sends a signed-in, onboarded user home', () => {
    mockSession.current = SIGNED_IN;
    render(<Index />);

    expect(destination()).toBe('/home');
  });

  it('does not treat an unfinished intro as a reason to leave `hydrating`', () => {
    // Both flags come from the same `hydrateAuth()` pass, and the onboarding one
    // reads `false` before it lands. If hydration were not checked first, every
    // cold start would send a returning member to the intro they already
    // completed.
    mockSession.current = HYDRATING;
    mockOnboarded.current = false;
    const view = render(<Index />);

    expect(view.toJSON()).toBeNull();
  });

  it('renders no chrome of its own — it is a dispatch, not a screen', () => {
    mockSession.current = SIGNED_IN;
    render(
      <View testID="host">
        <Index />
      </View>,
    );

    // No header, so it cannot break plan §6 item 7's one-header-per-screen rule
    // for whatever it hands off to.
    expect(screen.queryAllByRole('header')).toHaveLength(0);
  });
});
