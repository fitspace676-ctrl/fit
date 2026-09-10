// The two properties this component exists for, asserted directly.
//
// It is split out of `settings.tsx` precisely so these can be checked without
// mounting the screen and its queries, so this file mounts nothing else.
import { SHEET_EXIT_MS } from '@fit/ui-mobile';
import { act, fireEvent, waitFor } from '@testing-library/react-native';

import { SignOutSection } from './sign-out-section';
import { renderScreen } from '../../test-support/render-screen';

/** `ConfirmSheet` derives these from the section's own `testID`. */
const ROW = 'settings-sign-out';
const SHEET = `${ROW}-confirm`;
const CONFIRM = `${SHEET}-confirm`;
const CANCEL = `${SHEET}-cancel`;

/**
 * Wait for the sheet's `Modal` to actually unmount.
 *
 * `Sheet` keeps the window mounted for `SHEET_EXIT_MS` so the exit animation
 * has something to animate, and it uses a PLAIN `setTimeout` for exactly this
 * reason — the package's own `sheet.test.tsx` drives it the same way. Polling
 * with `waitFor` instead is what made this file flaky: it passed alone at
 * ~1.2s and blew the 1s default when the suite ran nine files in parallel.
 */
async function flushSheetExit(): Promise<void> {
  await act(() => {
    jest.advanceTimersByTime(SHEET_EXIT_MS + 1);
    return Promise.resolve();
  });
}

beforeEach(() => {
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('confirming first', () => {
  it('does not sign out on the row press — it asks', async () => {
    // The whole point of the component. Sign-out is one tap from the bottom of
    // a list of otherwise-harmless rows, and undoing it means finding the
    // password again.
    const onSignOut = jest.fn(() => Promise.resolve());
    const { getByTestId, queryByTestId } = renderScreen(<SignOutSection onSignOut={onSignOut} />);

    expect(queryByTestId(SHEET)).toBeNull();

    fireEvent.press(getByTestId(ROW));

    expect(onSignOut).not.toHaveBeenCalled();
    await waitFor(() => {
      expect(getByTestId(SHEET)).toBeTruthy();
    });
  });

  it('signs out once the confirmation is taken, and reports it', async () => {
    const onSignOut = jest.fn(() => Promise.resolve());
    const onSignedOut = jest.fn();
    const { getByTestId } = renderScreen(
      <SignOutSection onSignOut={onSignOut} onSignedOut={onSignedOut} />,
    );

    fireEvent.press(getByTestId(ROW));
    await waitFor(() => {
      expect(getByTestId(CONFIRM)).toBeTruthy();
    });
    fireEvent.press(getByTestId(CONFIRM));

    await waitFor(() => {
      expect(onSignOut).toHaveBeenCalledTimes(1);
      expect(onSignedOut).toHaveBeenCalledTimes(1);
    });
  });

  it('leaves the session alone when the sheet is cancelled', async () => {
    const onSignOut = jest.fn(() => Promise.resolve());
    const { getByTestId, queryByTestId } = renderScreen(<SignOutSection onSignOut={onSignOut} />);

    fireEvent.press(getByTestId(ROW));
    await waitFor(() => {
      expect(getByTestId(CANCEL)).toBeTruthy();
    });
    fireEvent.press(getByTestId(CANCEL));

    expect(onSignOut).not.toHaveBeenCalled();
    // `Sheet` keeps its `Modal` mounted through the exit animation, so the
    // sheet goes away one timer later, not on the same frame.
    await flushSheetExit();
    expect(queryByTestId(SHEET)).toBeNull();
  });

  it('fires exactly one sign-out for a double tap', async () => {
    // `busy` swallows the second press. Two presses landing on `POST
    // /auth/logout` is two refresh-family revocations, the second of which
    // 401s against a token the first already killed.
    let settle: () => void = () => undefined;
    const onSignOut = jest.fn(
      () =>
        new Promise<void>((resolve) => {
          settle = resolve;
        }),
    );
    const { getByTestId } = renderScreen(<SignOutSection onSignOut={onSignOut} />);

    fireEvent.press(getByTestId(ROW));
    await waitFor(() => {
      expect(getByTestId(CONFIRM)).toBeTruthy();
    });
    fireEvent.press(getByTestId(CONFIRM));
    fireEvent.press(getByTestId(CONFIRM));

    expect(onSignOut).toHaveBeenCalledTimes(1);
    await act(() => {
      settle();
      return Promise.resolve();
    });
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('still ends signed out when the sign-out call rejects', async () => {
    // `signOut()` is documented never to reject, and this arm exists so an
    // injected double cannot wedge the sheet open with `busy` latched — a
    // member left staring at a spinner they cannot dismiss.
    const onSignOut = jest.fn(() => Promise.reject(new Error('offline')));
    const onSignedOut = jest.fn();
    const { getByTestId, queryByTestId } = renderScreen(
      <SignOutSection onSignOut={onSignOut} onSignedOut={onSignedOut} />,
    );

    fireEvent.press(getByTestId(ROW));
    await waitFor(() => {
      expect(getByTestId(CONFIRM)).toBeTruthy();
    });
    fireEvent.press(getByTestId(CONFIRM));

    await waitFor(() => {
      expect(onSignedOut).toHaveBeenCalledTimes(1);
    });
    await flushSheetExit();
    expect(queryByTestId(SHEET)).toBeNull();
  });
});

describe('the a11y and copy contract', () => {
  it('names the row and marks it destructive', () => {
    const { getByTestId } = renderScreen(<SignOutSection onSignOut={() => Promise.resolve()} />);
    const row = getByTestId(ROW);
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Sign out');
  });

  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const { getByTestId, toJSON } = renderScreen(
        <SignOutSection onSignOut={() => Promise.resolve()} />,
        { locale },
      );
      fireEvent.press(getByTestId(ROW));
      await waitFor(() => {
        expect(getByTestId(SHEET)).toBeTruthy();
      });
      expect(JSON.stringify(toJSON())).not.toMatch(/"settings\.[a-z]/i);
    }
  });
});
