// Every branch of the sign-in screen, per plan §6 item 8.
//
// The two that matter most and are easiest to lose:
//
//   * a failed sign-in is INLINE, never a toast — a toast auto-dismisses, and
//     the message has to still be on screen when the user looks back at the
//     field they need to fix;
//   * the screen does NOT navigate on success. `RouteGuard` does. A test that
//     asserted `router.replace` here would be locking in the exact defect this
//     stage exists to avoid.

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { ApiError } from '../../lib/http/api-error';
import { a11yState } from '../../test-support/a11y';
import { renderApp } from '../../test-support/render';
import { flatStyle } from '../../test-support/style';
import LoginScreen from './login';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Typed, because an untyped `jest.fn()` returns `any` and the factory arrow
// below would then be an unsafe return at every mocked module boundary.
const mockSignIn = jest.fn<Promise<unknown>, unknown[]>();
const mockResolveGymSlug = jest.fn(() => 'downtown');

jest.mock('../../lib/auth/session', () => ({
  signIn: (...args: unknown[]) => mockSignIn(...args),
  resolveGymSlug: () => mockResolveGymSlug(),
}));

/** A promise that never settles — the "request in flight" state. */
function pending(): Promise<never> {
  return new Promise<never>(() => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('login screen', () => {
  it('renders the form, with exactly one header', () => {
    renderApp(<LoginScreen />);

    expect(screen.getByTestId('login')).toBeTruthy();
    expect(screen.getByTestId('login-email-input')).toBeTruthy();
    expect(screen.getByTestId('login-password-input')).toBeTruthy();
    expect(screen.getByTestId('login-submit')).toBeTruthy();

    // Plan §6 item 7: one `accessibilityRole="header"` per screen. `AppBar`'s
    // `Heading` is it; nothing else on the screen may claim the role.
    //
    // `getAllByRole` and NOT `UNSAFE_getAllByProps`: the latter walks composite
    // fibers too, so one `Heading` matches three times (`Heading`, the `Text` it
    // delegates to, and the host `Text`) and the count means nothing.
    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Sign in to FormaCore');
  });

  // The join funnel had no inbound link anywhere in the app: `(join)/checkout`
  // was reachable only by a `fit://checkout` deep link, so a visitor who
  // browsed the public classes and tapped Book was offered a sign-in for an
  // account they do not have — and no way to become a member at all. Every
  // signed-out CTA routes here, so this is the one place the offer belongs.
  //
  // And it is the ONLY offer here now. A second row underneath the tile asked
  // the same question ("Don't have an account?") and answered it differently —
  // `/register` mints a login and sells nothing — which is how a buyer ends up
  // with an account and no membership.
  it('offers the join funnel, and offers it once', () => {
    const screen = renderApp(<LoginScreen />);

    fireEvent.press(screen.getByTestId('login-join-link'));
    expect(mockPush).toHaveBeenCalledWith('/checkout');

    expect(screen.queryByTestId('login-register-link')).toBeNull();
  });

  // ==========================================================================
  // A SENTENCE IS NOT AN EYEBROW.
  //
  // The join tile's note shipped in `micro` — 10px / 600 / 0.10em UPPERCASE, a
  // role documented for tab labels and the smallest legible kicker. Set in it,
  // the Georgian sentence renders as MTAVRULI: Georgian has no sentence case,
  // so uppercasing prose does not emphasise it, it swaps the script the reader
  // is reading. `caption` is the scale's helper-text role.
  // ==========================================================================
  it('sets the join note as helper text, not as an uppercase eyebrow', () => {
    const screen = renderApp(<LoginScreen />, { locale: 'ka' });
    const style = flatStyle(screen.getByTestId('login-join-note'));
    expect(style.textTransform).toBeUndefined();
    expect(style.fontSize).toBe(12);
  });

  it('a transient failure leaves a retry that actually re-fires (§6 item 3)', async () => {
    // The retry on a form IS the submit button, so "a working retry" means the
    // button comes back enabled AND a second press reaches the network. A 503 is
    // the case where pressing again is honest; the 401 above is the case where
    // it is not, and there the fix is at the field.
    mockSignIn.mockRejectedValueOnce(new ApiError({ status: 503, code: 'UNAVAILABLE' }));
    renderApp(<LoginScreen />);

    fireEvent.press(screen.getByTestId('login-submit'));
    await screen.findByTestId('login-error');

    const submit = screen.getByTestId('login-submit');
    expect(a11yState(submit).disabled).toBe(false);
    expect(a11yState(submit).busy).toBe(false);

    mockSignIn.mockReturnValueOnce(pending());
    fireEvent.press(submit);
    expect(mockSignIn).toHaveBeenCalledTimes(2);
    // And the stale message is cleared the moment the retry starts, rather than
    // sitting under a spinner claiming a failure that is no longer true.
    expect(screen.queryByTestId('login-error')).toBeNull();
  });

  it('sends the resolved gym slug with the credentials (D4)', () => {
    mockSignIn.mockReturnValue(pending());
    renderApp(<LoginScreen />);

    fireEvent.changeText(screen.getByTestId('login-email-input'), 'a@b.co');
    fireEvent.changeText(screen.getByTestId('login-password-input'), 'hunter22');
    fireEvent.press(screen.getByTestId('login-submit'));

    expect(mockSignIn).toHaveBeenCalledWith({
      email: 'a@b.co',
      password: 'hunter22',
      gymSlug: 'downtown',
    });
  });

  it('marks submit busy while the request is in flight, and swallows a second press', () => {
    mockSignIn.mockReturnValue(pending());
    renderApp(<LoginScreen />);

    const submit = screen.getByTestId('login-submit');
    fireEvent.press(submit);

    expect(a11yState(submit).busy).toBe(true);
    expect(screen.getByText('Signing in…')).toBeTruthy();

    fireEvent.press(submit);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('shows a failure inline on the form — not as a toast', async () => {
    mockSignIn.mockRejectedValue(new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' }));
    renderApp(<LoginScreen />);

    fireEvent.press(screen.getByTestId('login-submit'));

    const alert = await screen.findByTestId('login-error');
    expect(alert).toBeTruthy();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    // Re-enabled, because the fix is at the field and the user must be able to
    // press again once they have made it.
    expect(a11yState(screen.getByTestId('login-submit')).busy).toBe(false);
  });

  it('does not navigate on success — the guard does', async () => {
    mockSignIn.mockResolvedValue({ tokens: {}, claims: null, gymScope: Promise.resolve({}) });
    renderApp(<LoginScreen />);

    fireEvent.press(screen.getByTestId('login-submit'));

    await waitFor(() => {
      expect(mockSignIn).toHaveBeenCalledTimes(1);
    });
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    // And it stays busy on the way out, so a double-press cannot fire a second
    // `POST /auth/login` into the same rate limiter.
    expect(a11yState(screen.getByTestId('login-submit')).busy).toBe(true);
  });

  it('on a 429 shows a live countdown and blocks submit', async () => {
    jest.useFakeTimers();
    try {
      mockSignIn.mockRejectedValue(
        new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec: 3 }),
      );
      renderApp(<LoginScreen />);

      fireEvent.press(screen.getByTestId('login-submit'));
      await act(async () => Promise.resolve());

      expect(screen.getByTestId('login-cooldown')).toBeTruthy();
      expect(screen.getByText('Try again in 3s')).toBeTruthy();
      expect(a11yState(screen.getByTestId('login-submit')).disabled).toBe(true);

      // It counts DOWN — a static "try again later" leaves the user pressing a
      // dead button on a schedule they cannot see.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Try again in 2s')).toBeTruthy();

      // And nothing auto-retried on the way through.
      expect(mockSignIn).toHaveBeenCalledTimes(1);

      // When it expires, submit comes back.
      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByTestId('login-cooldown')).toBeNull();
      expect(a11yState(screen.getByTestId('login-submit')).disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('offline: shows the advisory, disables submit, and fires nothing', () => {
    onlineManager.setOnline(false);
    renderApp(<LoginScreen />);

    expect(screen.getByTestId('login-offline')).toBeTruthy();
    const submit = screen.getByTestId('login-submit');
    expect(a11yState(submit).disabled).toBe(true);

    fireEvent.press(submit);
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('renders in Georgian — no English is baked into the screen', () => {
    renderApp(<LoginScreen />, { locale: 'ka' });

    expect(screen.getByText('შესვლა FormaCore-ში')).toBeTruthy();
    expect(screen.getByText('დაგავიწყდა პაროლი?')).toBeTruthy();
    expect(screen.queryByText('Sign in to FormaCore')).toBeNull();
  });

  it('links to forgot-password and to the join funnel without signing anything in', () => {
    renderApp(<LoginScreen />);

    fireEvent.press(screen.getByTestId('login-forgot'));
    expect(mockPush).toHaveBeenCalledWith('/forgot-password');

    fireEvent.press(screen.getByTestId('login-join-link'));
    expect(mockPush).toHaveBeenCalledWith('/checkout');
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});
