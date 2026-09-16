// Every branch of the set-a-new-password screen, per plan §6 item 8.
//
// The branch that has to be nailed shut is the dead link. A blank or missing
// `?token=` can never succeed — the API consumes a single-use token and there is
// nothing this screen could send — so rendering the form anyway means the user
// types a password, presses the button, and is told it failed, having handed a
// password to a screen that was never going to use it. The assertions below
// check both halves: the error panel IS there, and the form is NOT.
//
// The other one is the mirror of register's: a reset DOES issue a session (the
// API revokes every other one first, which is the entire point of resetting a
// possibly-compromised password), so the screen must not navigate — `RouteGuard`
// does, off the session flip.

import { act, fireEvent, screen } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { ApiError } from '../../lib/http/api-error';
import { a11yState } from '../../test-support/a11y';
import { renderApp } from '../../test-support/render';
import ResetPasswordScreen from './reset-password';

const mockPush = jest.fn();
const mockReplace = jest.fn();

// The route params are per-test, so the factory reads a mutable box rather than
// closing over a value. `mock`-prefixed, because a `jest.mock` factory is
// hoisted above the imports and may not touch anything else.
const mockParams: { token?: string | string[] } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const mockCompletePasswordReset = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('../../lib/auth/session', () => ({
  completePasswordReset: (...args: unknown[]) => mockCompletePasswordReset(...args),
}));

/** A promise that never settles — the "request in flight" state. */
function pending(): Promise<never> {
  return new Promise<never>(() => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  delete mockParams.token;
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('reset-password screen · no usable token', () => {
  // Absent, empty, whitespace, and an empty first value of a repeated parameter.
  // A malformed link produces all four, and every one of them is "nothing to
  // send" — so every one of them must land on the same panel.
  const dead: [string, string | string[] | undefined][] = [
    ['absent', undefined],
    ['empty', ''],
    ['whitespace only', '   '],
    ['repeated, first empty', ['', 'abc']],
  ];

  it.each(dead)('%s: renders the error panel and NEVER the form', (_label, value) => {
    if (value !== undefined) mockParams.token = value;
    renderApp(<ResetPasswordScreen />);

    expect(screen.getByTestId('reset-missing-token')).toBeTruthy();
    expect(
      screen.getByText('This reset link is invalid or has expired. Request a new one.'),
    ).toBeTruthy();

    // The form is not merely disabled — it does not exist. There is no code path
    // on which a password field and a null token both exist.
    expect(screen.queryByTestId('reset-password-input')).toBeNull();
    expect(screen.queryByTestId('reset-submit')).toBeNull();
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  it('offers a way out, and it is the one that can actually work', () => {
    renderApp(<ResetPasswordScreen />);

    // A dead end with no button is how the old app's error boxes read. The
    // action is "request a new link", not "try again" — trying again with the
    // same dead token is doing the same thing twice and hoping.
    fireEvent.press(screen.getByTestId('reset-request-new'));
    expect(mockReplace).toHaveBeenCalledWith('/forgot-password');
  });

  it('still has exactly one header', () => {
    renderApp(<ResetPasswordScreen />);

    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Set a new password');
  });

  it('renders in Georgian', () => {
    renderApp(<ResetPasswordScreen />, { locale: 'ka' });

    expect(
      screen.getByText('აღდგენის ბმული არასწორია ან ვადაგასულია. მოითხოვე ახალი.'),
    ).toBeTruthy();
    expect(screen.queryByText(/This reset link/)).toBeNull();
  });
});

describe('reset-password screen · with a token', () => {
  beforeEach(() => {
    mockParams.token = 'tok_abc123';
  });

  it('renders the form, with exactly one header', () => {
    renderApp(<ResetPasswordScreen />);

    expect(screen.getByTestId('reset')).toBeTruthy();
    expect(screen.getByTestId('reset-password-input')).toBeTruthy();
    expect(screen.getByTestId('reset-submit')).toBeTruthy();
    expect(screen.getByText('At least 8 characters.')).toBeTruthy();
    expect(screen.queryByTestId('reset-missing-token')).toBeNull();

    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Set a new password');
  });

  it('sends the trimmed token from the URL together with the new password', () => {
    mockParams.token = '  tok_abc123  ';
    mockCompletePasswordReset.mockReturnValue(pending());
    renderApp(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('reset-password-input'), 'hunter22');
    fireEvent.press(screen.getByTestId('reset-submit'));

    expect(mockCompletePasswordReset).toHaveBeenCalledWith({
      token: 'tok_abc123',
      password: 'hunter22',
    });
  });

  it('takes the FIRST value when the link repeats the parameter', () => {
    mockParams.token = ['tok_first', 'tok_second'];
    mockCompletePasswordReset.mockReturnValue(pending());
    renderApp(<ResetPasswordScreen />);

    fireEvent.press(screen.getByTestId('reset-submit'));

    expect(mockCompletePasswordReset).toHaveBeenCalledWith({
      token: 'tok_first',
      password: '',
    });
  });

  it('marks submit busy while the request is in flight, and swallows a second press', () => {
    mockCompletePasswordReset.mockReturnValue(pending());
    renderApp(<ResetPasswordScreen />);

    const submit = screen.getByTestId('reset-submit');
    fireEvent.press(submit);

    expect(a11yState(submit).busy).toBe(true);
    expect(screen.getByText('Updating…')).toBeTruthy();

    fireEvent.press(submit);
    expect(mockCompletePasswordReset).toHaveBeenCalledTimes(1);
  });

  it('does not navigate on success — the guard does, off the new session', async () => {
    mockCompletePasswordReset.mockResolvedValue(undefined);
    renderApp(<ResetPasswordScreen />);

    fireEvent.press(screen.getByTestId('reset-submit'));
    await act(async () => Promise.resolve());

    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
    // And it stays busy on the way out, so a double-press cannot spend a second
    // of the five `authStrict` allows on a token that is already consumed.
    expect(a11yState(screen.getByTestId('reset-submit')).busy).toBe(true);
  });

  it('shows a failure inline, and the retry re-fires (§6 item 3)', async () => {
    mockCompletePasswordReset.mockRejectedValueOnce(
      new ApiError({ status: 503, code: 'UNAVAILABLE' }),
    );
    renderApp(<ResetPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('reset-password-input'), 'hunter22');
    fireEvent.press(screen.getByTestId('reset-submit'));

    expect(await screen.findByTestId('reset-error')).toBeTruthy();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();

    const submit = screen.getByTestId('reset-submit');
    expect(a11yState(submit).disabled).toBe(false);
    expect(a11yState(submit).busy).toBe(false);

    mockCompletePasswordReset.mockReturnValueOnce(pending());
    fireEvent.press(submit);
    expect(mockCompletePasswordReset).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('reset-error')).toBeNull();
  });

  it('on a 429 shows a live countdown, blocks submit, and never auto-retries', async () => {
    jest.useFakeTimers();
    try {
      mockCompletePasswordReset.mockRejectedValue(
        new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec: 3 }),
      );
      renderApp(<ResetPasswordScreen />);

      fireEvent.press(screen.getByTestId('reset-submit'));
      await act(async () => Promise.resolve());

      expect(screen.getByTestId('reset-cooldown')).toBeTruthy();
      expect(screen.getByText('Try again in 3s')).toBeTruthy();
      expect(a11yState(screen.getByTestId('reset-submit')).disabled).toBe(true);

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Try again in 2s')).toBeTruthy();

      fireEvent.press(screen.getByTestId('reset-submit'));
      expect(mockCompletePasswordReset).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByTestId('reset-cooldown')).toBeNull();
      expect(a11yState(screen.getByTestId('reset-submit')).disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('offline: shows the advisory, disables submit, and fires nothing', () => {
    onlineManager.setOnline(false);
    renderApp(<ResetPasswordScreen />);

    // TODO(i18n) — `common.offline.title` / `common.offline.body` do not exist in
    // either catalogue (WP-16). Asserted structurally; the English placeholder is
    // deliberately not pinned.
    expect(screen.getByTestId('reset-offline')).toBeTruthy();

    const submit = screen.getByTestId('reset-submit');
    expect(a11yState(submit).disabled).toBe(true);

    fireEvent.press(submit);
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });

  it('renders in Georgian — no English is baked into the screen', () => {
    renderApp(<ResetPasswordScreen />, { locale: 'ka' });

    expect(screen.getByText('ახალი პაროლის დაყენება')).toBeTruthy();
    expect(screen.getByText('მინიმუმ 8 სიმბოლო.')).toBeTruthy();
    expect(screen.queryByText('Set a new password')).toBeNull();
  });

  it('back goes to sign-in by replacing, and sends nothing', () => {
    renderApp(<ResetPasswordScreen />);

    fireEvent.press(screen.getByTestId('reset-back'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockCompletePasswordReset).not.toHaveBeenCalled();
  });
});
