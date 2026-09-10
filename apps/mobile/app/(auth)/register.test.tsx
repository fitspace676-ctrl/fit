// Every branch of the create-account screen, per plan §6 item 8.
//
// Two of them are the whole reason this screen is not a copy of login:
//
//   * **registration issues no session.** `POST /auth/register` sends a
//     verification email and returns nothing to adopt, so there is no session
//     for `RouteGuard` to react to and nothing to navigate to. A test that
//     asserted a redirect here would be asserting a bug.
//   * **the form is replaced, not disabled.** Leaving it standing beside its own
//     confirmation invites a second submit, and this screen sits behind
//     `authStrict` — 5 requests per 900 seconds — so a stray second submit costs
//     a fifth of the user's budget.

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { ApiError } from '../../lib/http/api-error';
import { a11yState } from '../../test-support/a11y';
import { renderApp } from '../../test-support/render';
import RegisterScreen from './register';

const mockPush = jest.fn();
const mockReplace = jest.fn();

// A `jest.mock` factory is hoisted above every import, so it may only close over
// a binding whose name begins with `mock`. That rule is why these are not called
// `push`/`replace`.
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// Typed rather than bare: an untyped `jest.fn()` is `any`, which makes every
// factory arrow below an unsafe return.
const mockRegisterAccount = jest.fn<Promise<unknown>, unknown[]>();
const mockSignIn = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('../../lib/auth/session', () => ({
  registerAccount: (...args: unknown[]) => mockRegisterAccount(...args),
  // Present only so the assertion "no session was issued" has something to
  // assert against: if this screen ever grows a sign-in, this spy catches it.
  signIn: (...args: unknown[]) => mockSignIn(...args),
}));

/** A promise that never settles — the "request in flight" state. */
function pending(): Promise<never> {
  return new Promise<never>(() => undefined);
}

/** Fill the form the way a user would, so submit carries real values. */
function fillForm(): void {
  fireEvent.changeText(screen.getByTestId('register-name-input'), 'Nino Gelashvili');
  fireEvent.changeText(screen.getByTestId('register-email-input'), 'nino@example.com');
  fireEvent.changeText(screen.getByTestId('register-password-input'), 'hunter22');
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('register screen', () => {
  it('renders the form, with exactly one header', () => {
    renderApp(<RegisterScreen />);

    expect(screen.getByTestId('register')).toBeTruthy();
    expect(screen.getByTestId('register-name-input')).toBeTruthy();
    expect(screen.getByTestId('register-email-input')).toBeTruthy();
    expect(screen.getByTestId('register-password-input')).toBeTruthy();
    expect(screen.getByTestId('register-submit')).toBeTruthy();

    // The password rule is stated BEFORE it can be broken. `PASSWORD_MIN_LENGTH`
    // is what the API enforces; a rejection afterwards is not the same thing.
    expect(screen.getByText('At least 8 characters.')).toBeTruthy();
    expect(screen.getByTestId('register-terms')).toBeTruthy();

    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Create your account');
  });

  it('sends exactly the three fields the endpoint takes', () => {
    mockRegisterAccount.mockReturnValue(pending());
    renderApp(<RegisterScreen />);

    fillForm();
    fireEvent.press(screen.getByTestId('register-submit'));

    expect(mockRegisterAccount).toHaveBeenCalledWith({
      name: 'Nino Gelashvili',
      email: 'nino@example.com',
      password: 'hunter22',
    });
  });

  it('marks submit busy while the request is in flight, and swallows a second press', () => {
    mockRegisterAccount.mockReturnValue(pending());
    renderApp(<RegisterScreen />);

    const submit = screen.getByTestId('register-submit');
    fireEvent.press(submit);

    expect(a11yState(submit).busy).toBe(true);
    expect(screen.getByText('Creating account…')).toBeTruthy();

    // The second press matters more here than anywhere else: five requests per
    // 900 seconds, and a double-tap spends two of them.
    fireEvent.press(submit);
    expect(mockRegisterAccount).toHaveBeenCalledTimes(1);
  });

  it('on success replaces the form with the inbox panel — and issues no session', async () => {
    mockRegisterAccount.mockResolvedValue(undefined);
    renderApp(<RegisterScreen />);

    fillForm();
    fireEvent.press(screen.getByTestId('register-submit'));

    const panel = await screen.findByTestId('register-success');
    expect(panel).toBeTruthy();
    expect(screen.getByText(/Check your inbox to verify your email/)).toBeTruthy();

    // GONE, not disabled. There is nothing left to submit.
    expect(screen.queryByTestId('register-name-input')).toBeNull();
    expect(screen.queryByTestId('register-email-input')).toBeNull();
    expect(screen.queryByTestId('register-password-input')).toBeNull();
    expect(screen.queryByTestId('register-submit')).toBeNull();

    // No session, and therefore no navigation: the first session arrives later,
    // on `/verify`, and `RouteGuard` has nothing to react to until it does.
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    // The way back is still there — the panel is not a dead end.
    expect(screen.getByTestId('register-login-link')).toBeTruthy();
  });

  it('shows a failure inline, and the retry re-fires (§6 item 3)', async () => {
    mockRegisterAccount.mockRejectedValueOnce(new ApiError({ status: 503, code: 'UNAVAILABLE' }));
    renderApp(<RegisterScreen />);

    fillForm();
    fireEvent.press(screen.getByTestId('register-submit'));

    expect(await screen.findByTestId('register-error')).toBeTruthy();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    // The form is still there — the user's typing is not thrown away by a
    // failure they did not cause.
    expect(screen.getByTestId('register-email-input')).toBeTruthy();

    const submit = screen.getByTestId('register-submit');
    expect(a11yState(submit).disabled).toBe(false);

    mockRegisterAccount.mockReturnValueOnce(pending());
    fireEvent.press(submit);
    expect(mockRegisterAccount).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('register-error')).toBeNull();
  });

  it('on a 429 shows a live countdown, blocks submit, and never auto-retries', async () => {
    jest.useFakeTimers();
    try {
      mockRegisterAccount.mockRejectedValue(
        new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec: 3 }),
      );
      renderApp(<RegisterScreen />);

      fireEvent.press(screen.getByTestId('register-submit'));
      await act(async () => Promise.resolve());

      expect(screen.getByTestId('register-cooldown')).toBeTruthy();
      expect(screen.getByText('Try again in 3s')).toBeTruthy();
      expect(a11yState(screen.getByTestId('register-submit')).disabled).toBe(true);

      // A dead button with no explanation is indistinguishable from a broken
      // app, so the countdown is the point — it has to MOVE.
      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Try again in 2s')).toBeTruthy();

      // Retrying a rate-limit response is exactly what the limiter defends
      // against; nothing here may do it on the user's behalf.
      expect(mockRegisterAccount).toHaveBeenCalledTimes(1);

      // Pressing anyway spends nothing.
      fireEvent.press(screen.getByTestId('register-submit'));
      expect(mockRegisterAccount).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByTestId('register-cooldown')).toBeNull();
      expect(a11yState(screen.getByTestId('register-submit')).disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('offline: shows the advisory, disables submit, and fires nothing', () => {
    onlineManager.setOnline(false);
    renderApp(<RegisterScreen />);

    // TODO(i18n) — `common.offline.title` / `common.offline.body` do not exist in
    // either catalogue (WP-16). The branch is asserted STRUCTURALLY, by testID,
    // and the English placeholder deliberately is not: pinning it here would
    // make the eventual Georgian copy a test failure.
    expect(screen.getByTestId('register-offline')).toBeTruthy();

    const submit = screen.getByTestId('register-submit');
    expect(a11yState(submit).disabled).toBe(true);

    fireEvent.press(submit);
    expect(mockRegisterAccount).not.toHaveBeenCalled();
  });

  it('renders in Georgian — no English is baked into the screen', () => {
    renderApp(<RegisterScreen />, { locale: 'ka' });

    expect(screen.getByText('შექმენი ანგარიში')).toBeTruthy();
    expect(screen.getByText('მინიმუმ 8 სიმბოლო.')).toBeTruthy();
    expect(screen.queryByText('Create your account')).toBeNull();
  });

  it('the success panel is Georgian too — the branch the form test cannot reach', async () => {
    mockRegisterAccount.mockResolvedValue(undefined);
    renderApp(<RegisterScreen />, { locale: 'ka' });

    fireEvent.press(screen.getByTestId('register-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('register-success')).toBeTruthy();
    });
    expect(screen.getByText(/თითქმის მზადაა!/)).toBeTruthy();
  });

  it('the sign-in link REPLACES rather than pushes — the stack has no cycle in it', () => {
    renderApp(<RegisterScreen />);

    fireEvent.press(screen.getByTestId('register-login-link'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockRegisterAccount).not.toHaveBeenCalled();
  });
});
