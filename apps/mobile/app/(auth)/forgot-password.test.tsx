// Every branch of the reset-request screen, per plan §6 item 8.
//
// The load-bearing one is the confirmation. `POST /auth/forgot-password` is
// deliberately indistinguishable whether or not the address exists — that is an
// account-enumeration defence — so the screen must have exactly ONE success
// state, shown for every 2xx, worded to be true either way. A test that let a
// second, "we couldn't find that account" state exist would be the test that
// green-lights giving the defence away.
//
// The sentence is also OURS, not the API's: the endpoint answers with one
// hardcoded English line by design, and rendering it verbatim puts English in
// the middle of a Georgian screen.

import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { ApiError } from '../../lib/http/api-error';
import { a11yState } from '../../test-support/a11y';
import { renderApp } from '../../test-support/render';
import ForgotPasswordScreen from './forgot-password';

const mockPush = jest.fn();
const mockReplace = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

const mockRequestPasswordReset = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('../../lib/auth/session', () => ({
  requestPasswordReset: (...args: unknown[]) => mockRequestPasswordReset(...args),
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

describe('forgot-password screen', () => {
  it('renders the form, with exactly one header', () => {
    renderApp(<ForgotPasswordScreen />);

    expect(screen.getByTestId('forgot')).toBeTruthy();
    expect(screen.getByTestId('forgot-email-input')).toBeTruthy();
    expect(screen.getByTestId('forgot-submit')).toBeTruthy();
    expect(screen.getByTestId('forgot-back')).toBeTruthy();

    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Reset your password');
  });

  it('sends the address as a bare string, the shape the fetcher takes', () => {
    mockRequestPasswordReset.mockReturnValue(pending());
    renderApp(<ForgotPasswordScreen />);

    fireEvent.changeText(screen.getByTestId('forgot-email-input'), 'nino@example.com');
    fireEvent.press(screen.getByTestId('forgot-submit'));

    expect(mockRequestPasswordReset).toHaveBeenCalledWith('nino@example.com');
  });

  it('marks submit busy while the request is in flight, and swallows a second press', () => {
    mockRequestPasswordReset.mockReturnValue(pending());
    renderApp(<ForgotPasswordScreen />);

    const submit = screen.getByTestId('forgot-submit');
    fireEvent.press(submit);

    expect(a11yState(submit).busy).toBe(true);
    expect(screen.getByText('Sending…')).toBeTruthy();

    fireEvent.press(submit);
    expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);
  });

  it('says the same generic thing whether or not the account exists', async () => {
    // Two runs, two different addresses, one of which the API would recognise
    // and one it would not. The API cannot tell us which — that is the whole
    // design — so the screen must be incapable of telling the user either.
    for (const address of ['known@example.com', 'stranger@example.com']) {
      mockRequestPasswordReset.mockResolvedValue(undefined);
      const view = renderApp(<ForgotPasswordScreen />);

      fireEvent.changeText(screen.getByTestId('forgot-email-input'), address);
      fireEvent.press(screen.getByTestId('forgot-submit'));

      expect(await screen.findByTestId('forgot-sent')).toBeTruthy();
      expect(
        screen.getByText(
          'If that email is registered, a reset link is on its way. Check your inbox.',
        ),
      ).toBeTruthy();

      // The address the user typed is not echoed back — a confirmation that
      // repeats the address is one step from a confirmation that validates it.
      expect(screen.queryByText(new RegExp(address))).toBeNull();

      // And the form is gone, so a second submit cannot spend a second of the
      // five `authStrict` allows.
      expect(screen.queryByTestId('forgot-email-input')).toBeNull();
      expect(screen.queryByTestId('forgot-submit')).toBeNull();
      expect(screen.getByTestId('forgot-back')).toBeTruthy();

      view.unmount();
    }
  });

  it('shows a failure inline, and the retry re-fires (§6 item 3)', async () => {
    mockRequestPasswordReset.mockRejectedValueOnce(
      new ApiError({ status: 0, code: 'NETWORK_ERROR' }),
    );
    renderApp(<ForgotPasswordScreen />);

    fireEvent.press(screen.getByTestId('forgot-submit'));

    expect(await screen.findByTestId('forgot-error')).toBeTruthy();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    // Not the success panel: a failed send must never look like a sent link, or
    // the user waits for an email that is not coming.
    expect(screen.queryByTestId('forgot-sent')).toBeNull();

    const submit = screen.getByTestId('forgot-submit');
    expect(a11yState(submit).disabled).toBe(false);

    mockRequestPasswordReset.mockReturnValueOnce(pending());
    fireEvent.press(submit);
    expect(mockRequestPasswordReset).toHaveBeenCalledTimes(2);
    expect(screen.queryByTestId('forgot-error')).toBeNull();
  });

  it('on a 429 shows a live countdown, blocks submit, and never auto-retries', async () => {
    jest.useFakeTimers();
    try {
      mockRequestPasswordReset.mockRejectedValue(
        new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec: 3 }),
      );
      renderApp(<ForgotPasswordScreen />);

      fireEvent.press(screen.getByTestId('forgot-submit'));
      await act(async () => Promise.resolve());

      expect(screen.getByTestId('forgot-cooldown')).toBeTruthy();
      expect(screen.getByText('Try again in 3s')).toBeTruthy();
      expect(a11yState(screen.getByTestId('forgot-submit')).disabled).toBe(true);
      // A rate limit is not a "sent" — the panel must not appear.
      expect(screen.queryByTestId('forgot-sent')).toBeNull();

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Try again in 2s')).toBeTruthy();

      fireEvent.press(screen.getByTestId('forgot-submit'));
      expect(mockRequestPasswordReset).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByTestId('forgot-cooldown')).toBeNull();
      expect(a11yState(screen.getByTestId('forgot-submit')).disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });

  it('offline: shows the advisory, disables submit, and fires nothing', () => {
    onlineManager.setOnline(false);
    renderApp(<ForgotPasswordScreen />);

    // TODO(i18n) — `common.offline.title` / `common.offline.body` do not exist in
    // either catalogue (WP-16). Asserted structurally; the English placeholder is
    // deliberately not pinned.
    expect(screen.getByTestId('forgot-offline')).toBeTruthy();

    const submit = screen.getByTestId('forgot-submit');
    expect(a11yState(submit).disabled).toBe(true);

    fireEvent.press(submit);
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });

  it('renders in Georgian — including the confirmation', async () => {
    mockRequestPasswordReset.mockResolvedValue(undefined);
    renderApp(<ForgotPasswordScreen />, { locale: 'ka' });

    expect(screen.getByText('პაროლის აღდგენა')).toBeTruthy();
    expect(screen.queryByText('Reset your password')).toBeNull();

    fireEvent.press(screen.getByTestId('forgot-submit'));
    await waitFor(() => {
      expect(screen.getByTestId('forgot-sent')).toBeTruthy();
    });
    expect(screen.getByText(/თუ ეს ელფოსტა დარეგისტრირებულია/)).toBeTruthy();
  });

  it('back goes to sign-in by replacing, and sends nothing', () => {
    renderApp(<ForgotPasswordScreen />);

    fireEvent.press(screen.getByTestId('forgot-back'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    expect(mockRequestPasswordReset).not.toHaveBeenCalled();
  });
});
