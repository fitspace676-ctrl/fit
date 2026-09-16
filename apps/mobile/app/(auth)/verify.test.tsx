// Every state of the email-verification screen, per plan §6 item 8.
//
// This screen is a token exchange, not a form: it redeems `?token=` on mount and
// shows one of four things. The pair that must never be merged is `invalid` and
// `failed` — they look identical in a screenshot and behave oppositely:
//
//   invalid  the API refused the token (expired, spent, malformed). PERMANENT.
//            The only way out is a fresh link, so there is no retry button —
//            offering one tells the user to do the same thing twice and hope.
//   failed   the request never got an answer (offline, timeout, 5xx). TRANSIENT.
//            The token is still unspent, so the way out is the SAME button
//            pressed again — and throwing the token away over a flaky connection
//            would be the app manufacturing a dead end out of a working link.
//
// `isRetryable` is what separates them and it reads the status code, never the
// server's prose. The tests below drive both sides of it.

import { act, fireEvent, screen } from '@testing-library/react-native';
import { onlineManager } from '@tanstack/react-query';

import { ApiError } from '../../lib/http/api-error';
import { a11yState } from '../../test-support/a11y';
import { renderApp } from '../../test-support/render';
import VerifyScreen from './verify';

const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockParams: { token?: string | string[] } = {};

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: mockReplace, back: jest.fn() }),
  useLocalSearchParams: () => mockParams,
}));

const mockCompleteEmailVerification = jest.fn<Promise<unknown>, unknown[]>();

jest.mock('../../lib/auth/session', () => ({
  completeEmailVerification: (...args: unknown[]) => mockCompleteEmailVerification(...args),
}));

/** A promise that never settles — the exchange still in flight. */
function pending(): Promise<never> {
  return new Promise<never>(() => undefined);
}

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  mockParams.token = 'tok_abc123';
});

afterEach(() => {
  onlineManager.setOnline(true);
});

describe('verify screen · missing token', () => {
  const dead: [string, string | string[] | undefined][] = [
    ['absent', undefined],
    ['empty', ''],
    ['whitespace only', '  '],
  ];

  it.each(dead)('%s: shows the dead-link panel and attempts nothing', (_label, value) => {
    if (value === undefined) delete mockParams.token;
    else mockParams.token = value;

    renderApp(<VerifyScreen />);

    expect(screen.getByTestId('verify-missing-token')).toBeTruthy();
    expect(screen.getByText('This verification link is invalid or has expired.')).toBeTruthy();

    // Nothing was ever sent, so there is nothing to retry — and no spinner.
    expect(mockCompleteEmailVerification).not.toHaveBeenCalled();
    expect(screen.queryByTestId('verify-loading')).toBeNull();
    expect(screen.queryByTestId('verify-retry')).toBeNull();

    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('This link no longer works');
  });

  it('the way out is sign-in, and it replaces rather than pushes', () => {
    delete mockParams.token;
    renderApp(<VerifyScreen />);

    fireEvent.press(screen.getByTestId('verify-missing-cta'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
  });

  it('renders in Georgian', () => {
    delete mockParams.token;
    renderApp(<VerifyScreen />, { locale: 'ka' });

    expect(screen.getByText('დადასტურების ბმული არასწორია ან ვადაგასულია.')).toBeTruthy();
    expect(screen.queryByText(/This verification link/)).toBeNull();
  });
});

describe('verify screen · verifying', () => {
  it('redeems the token on mount and shows a labelled busy state', () => {
    mockCompleteEmailVerification.mockReturnValue(pending());
    renderApp(<VerifyScreen />);

    expect(mockCompleteEmailVerification).toHaveBeenCalledWith('tok_abc123');

    expect(screen.getByTestId('verify-loading')).toBeTruthy();
    // A busy indicator that announces nothing leaves a screen-reader user unable
    // to tell "still working" from "finished, and blank", so the spinner carries
    // the same sentence the visible line does.
    expect(screen.getAllByText('Verifying your email…').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Verifying your email…')).toBeTruthy();

    expect(screen.queryByTestId('verify-success')).toBeNull();
    expect(screen.queryByTestId('verify-failed')).toBeNull();
    expect(screen.queryByTestId('verify-invalid')).toBeNull();
  });

  it('trims the token, and takes the first of a repeated parameter', () => {
    mockParams.token = ['  tok_first  ', 'tok_second'];
    mockCompleteEmailVerification.mockReturnValue(pending());
    renderApp(<VerifyScreen />);

    expect(mockCompleteEmailVerification).toHaveBeenCalledWith('tok_first');
  });
});

describe('verify screen · verified', () => {
  it('announces success and does NOT navigate — the guard does', async () => {
    mockCompleteEmailVerification.mockResolvedValue(undefined);
    renderApp(<VerifyScreen />);

    const panel = await screen.findByTestId('verify-success');
    expect(panel).toBeTruthy();
    expect(screen.getByText("Email verified - you're all set.")).toBeTruthy();

    // The exchange issued the account's first session, so `RouteGuard` replaces
    // this route within a frame or two. A "Sign in" button here would send an
    // already-signed-in user at `/login`, which zone 3 of the guard's own table
    // bounces straight back.
    expect(screen.queryByTestId('verify-missing-cta')).toBeNull();
    expect(screen.queryByTestId('verify-invalid-cta')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();

    // `live`, because the state changed under a screen reader that was already
    // reading "Verifying…".
    expect(panel.props.accessibilityLiveRegion).toBe('polite');

    const headers = screen.getAllByRole('header');
    expect(headers).toHaveLength(1);
    expect(headers[0]).toHaveTextContent('Email verified');
  });

  it('renders in Georgian', async () => {
    mockCompleteEmailVerification.mockResolvedValue(undefined);
    renderApp(<VerifyScreen />, { locale: 'ka' });

    await screen.findByTestId('verify-success');
    expect(screen.getByText('ელფოსტა დადასტურდა - ყველაფერი მზადაა.')).toBeTruthy();
  });
});

describe('verify screen · invalid (permanent)', () => {
  it('a refused token gets no retry, only a fresh-link route out', async () => {
    mockCompleteEmailVerification.mockRejectedValue(
      new ApiError({ status: 400, code: 'INVALID_TOKEN' }),
    );
    renderApp(<VerifyScreen />);

    expect(await screen.findByTestId('verify-invalid')).toBeTruthy();
    // NOT `verify-failed`: a retry here would be the app telling the user their
    // correct action is to do the same thing twice.
    expect(screen.queryByTestId('verify-failed')).toBeNull();
    expect(screen.queryByTestId('verify-retry')).toBeNull();

    fireEvent.press(screen.getByTestId('verify-invalid-cta'));
    expect(mockReplace).toHaveBeenCalledWith('/login');
    // And it did not quietly try again on the way.
    expect(mockCompleteEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('a 401 is permanent too — the split is on the status, not the message', async () => {
    mockCompleteEmailVerification.mockRejectedValue(
      new ApiError({ status: 401, code: 'INVALID_CREDENTIALS' }),
    );
    renderApp(<VerifyScreen />);

    expect(await screen.findByTestId('verify-invalid')).toBeTruthy();
  });
});

describe('verify screen · failed (transient)', () => {
  it('a 5xx offers a retry that re-runs the exchange with the same token', async () => {
    mockCompleteEmailVerification.mockRejectedValueOnce(
      new ApiError({ status: 503, code: 'UNAVAILABLE' }),
    );
    renderApp(<VerifyScreen />);

    expect(await screen.findByTestId('verify-failed')).toBeTruthy();
    expect(screen.getByText('Something went wrong. Please try again.')).toBeTruthy();
    expect(screen.queryByTestId('verify-invalid')).toBeNull();

    const retry = screen.getByTestId('verify-retry');
    expect(a11yState(retry).disabled).toBe(false);
    expect(screen.getByText('Try again')).toBeTruthy();

    // The retry is a real re-run of the one request path, not a second copy of
    // it living in an `onPress` — so the token it sends is the same one.
    mockCompleteEmailVerification.mockReturnValueOnce(pending());
    fireEvent.press(retry);

    expect(mockCompleteEmailVerification).toHaveBeenCalledTimes(2);
    expect(mockCompleteEmailVerification).toHaveBeenLastCalledWith('tok_abc123');
    expect(screen.getByTestId('verify-loading')).toBeTruthy();
  });

  it('a transport failure is transient too, and a successful retry verifies', async () => {
    mockCompleteEmailVerification.mockRejectedValueOnce(
      new ApiError({ status: 0, code: 'NETWORK_ERROR' }),
    );
    renderApp(<VerifyScreen />);

    await screen.findByTestId('verify-failed');

    mockCompleteEmailVerification.mockResolvedValueOnce(undefined);
    fireEvent.press(screen.getByTestId('verify-retry'));

    expect(await screen.findByTestId('verify-success')).toBeTruthy();
  });

  it('offline: the advisory shows and the retry is not offered as one', async () => {
    mockCompleteEmailVerification.mockRejectedValue(
      new ApiError({ status: 0, code: 'NETWORK_ERROR' }),
    );
    renderApp(<VerifyScreen />);

    await screen.findByTestId('verify-failed');

    // The manager flip is an external-store change, so it has to be committed
    // inside `act` for the subscribed tree to re-render.
    act(() => {
      onlineManager.setOnline(false);
    });

    // TODO(i18n) — `common.offline.title` / `common.offline.body` do not exist in
    // either catalogue (WP-16). Asserted structurally; the English placeholder is
    // deliberately not pinned.
    expect(screen.getByTestId('verify-offline')).toBeTruthy();

    const retry = screen.getByTestId('verify-retry');
    expect(a11yState(retry).disabled).toBe(true);
    fireEvent.press(retry);
    expect(mockCompleteEmailVerification).toHaveBeenCalledTimes(1);
  });

  it('on a 429 the countdown runs and the retry is dead until it expires', async () => {
    jest.useFakeTimers();
    try {
      mockCompleteEmailVerification.mockRejectedValue(
        new ApiError({ status: 429, code: 'TOO_MANY_REQUESTS', retryAfterSec: 3 }),
      );
      renderApp(<VerifyScreen />);
      await act(async () => Promise.resolve());

      expect(screen.getByTestId('verify-cooldown')).toBeTruthy();
      expect(screen.getByText('Try again in 3s')).toBeTruthy();
      // A 429 is transient, so it is the `failed` face, not `invalid` — the
      // token has not been spent.
      expect(screen.getByTestId('verify-failed')).toBeTruthy();
      expect(a11yState(screen.getByTestId('verify-retry')).disabled).toBe(true);

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(screen.getByText('Try again in 2s')).toBeTruthy();

      // Nothing auto-retried, and pressing spends nothing.
      fireEvent.press(screen.getByTestId('verify-retry'));
      expect(mockCompleteEmailVerification).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(2000);
      });
      expect(screen.queryByTestId('verify-cooldown')).toBeNull();
      expect(a11yState(screen.getByTestId('verify-retry')).disabled).toBe(false);
    } finally {
      jest.useRealTimers();
    }
  });
});
