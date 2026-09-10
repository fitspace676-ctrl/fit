// `/profile/goals` — a replace-the-whole-set form.
//
// The assertion that matters most is that Save REFUSES a set the server would
// reject AND SAYS WHY. `PUT /me/goals` validates `target` as positive and caps
// the set at eight; a form that lets the member press Save into a 400 has moved
// the error to a toast that does not say which row is wrong — and a form that
// merely GREYS the button has moved it nowhere at all, because a disabled
// `Button` swallows its own press and can never explain itself. So the button
// stays live, the press is refused, and the reason goes on screen: the
// live-button + `showErrors` pattern `app/(join)/checkout.tsx` argues for.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';

import GoalsScreen from './goals';
import { renderApp } from '../../../test-support/render';
import { paintsOpaquely } from '../../../test-support/style';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockGetMyGoals = jest.fn();
const mockReplaceMyGoals = jest.fn();
jest.mock('../../../lib/api/me', () => ({
  getMyGoals: () => mockGetMyGoals() as unknown,
  replaceMyGoals: (input: unknown) => mockReplaceMyGoals(input) as unknown,
  getMyProfile: () => Promise.resolve({ profile: {} }),
  getMySubscription: () => Promise.resolve({ subscription: null, invoices: [] }),
  updateMyProfile: () => Promise.resolve({}),
}));

const GOALS = [{ id: 'g1', label: 'Workouts', current: 3, target: 12, unit: 'sessions' }];

beforeEach(() => {
  mockGetMyGoals.mockReset();
  mockReplaceMyGoals.mockReset();
  mockGetMyGoals.mockResolvedValue({ goals: GOALS });
  mockReplaceMyGoals.mockResolvedValue({ goals: GOALS });
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

/**
 * A host node's `accessibilityState`, typed.
 *
 * RNTL types host props as `any`, so reaching into them is three
 * `no-unsafe-*` lint errors at every call site. Narrowed once here, the way the
 * other screen tests narrow `props.children` for the header assertions.
 */
function a11yState(node: unknown): { disabled?: boolean; checked?: boolean; busy?: boolean } {
  return (
    (
      node as {
        props?: { accessibilityState?: { disabled?: boolean; checked?: boolean; busy?: boolean } };
      }
    ).props?.accessibilityState ?? {}
  );
}

describe('editing the set', () => {
  it('seeds from the server and writes the WHOLE set back', async () => {
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    fireEvent.changeText(getByTestId('goals-current-0-input'), '5');
    fireEvent.press(getByTestId('goals-save'));
    await waitFor(() => {
      expect(mockReplaceMyGoals).toHaveBeenCalledWith({
        goals: [{ label: 'Workouts', current: 5, target: 12, unit: 'sessions' }],
      });
    }, WAIT);
  });

  it('does not discard an edit when a background refetch lands', async () => {
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    // `TextField` forwards `testID` to the WRAPPER and `${testID}-input` to
    // the `TextInput` — the value lives on the latter.
    fireEvent.changeText(getByTestId('goals-label-0-input'), 'Cardio sessions');
    // A second resolution of the same query must not re-seed over the draft.
    await waitFor(() => {
      expect(getByTestId('goals-label-0-input').props.value).toBe('Cardio sessions');
    }, WAIT);
  });

  it('adds and removes rows, and a REMOVED goal is a deleted goal', async () => {
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    fireEvent.press(getByTestId('goals-remove-0'));
    // `PUT /me/goals` is a replace: an empty array clears the set, which is a
    // legal write and therefore a legal Save.
    await findByTestId('goals-empty', {}, WAIT);

    fireEvent.press(getByTestId('goals-add-first'));
    await findByTestId('goals-list', {}, WAIT);
  });

  it('REFUSES a row the server would reject, and says so instead of going grey', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);

    // `target` is `positive` in `putMeGoalsSchema`.
    fireEvent.changeText(getByTestId('goals-target-0-input'), '0');

    // The button is STILL LIVE — that is the point. A disabled one would
    // swallow the press and the member would never learn anything.
    await waitFor(() => {
      expect(a11yState(getByTestId('goals-save')).disabled).toBe(false);
    }, WAIT);
    expect(queryByTestId('goals-invalid')).toBeNull();

    fireEvent.press(getByTestId('goals-save'));
    // Nothing written…
    expect(mockReplaceMyGoals).not.toHaveBeenCalled();
    // …and the reason on screen.
    // TODO(i18n) `member.goals.invalid` — the English placeholder.
    expect(await findByTestId('goals-invalid', {}, WAIT)).toBeTruthy();

    fireEvent.changeText(getByTestId('goals-target-0-input'), '20');
    await waitFor(() => {
      expect(queryByTestId('goals-invalid')).toBeNull();
    }, WAIT);
    fireEvent.press(getByTestId('goals-save'));
    await waitFor(() => {
      expect(mockReplaceMyGoals).toHaveBeenCalled();
    }, WAIT);
  });

  it('points at the BOX that is wrong, not merely at the set', async () => {
    // "A name and a target" is not an instruction anyone can follow across
    // eight rows. `draftErrors` is what makes it specific.
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    fireEvent.changeText(getByTestId('goals-label-0-input'), '   ');
    fireEvent.press(getByTestId('goals-save'));

    await findByTestId('goals-invalid', {}, WAIT);
    expect(getByTestId('goals-label-0-input').props['aria-invalid']).toBe(true);
    expect(getByTestId('goals-target-0-input').props['aria-invalid']).toBe(false);
  });

  it('a freshly added row is the one this screen could never explain', async () => {
    // `emptyGoal()` starts with a BLANK target, so "Add goal" made Save dead on
    // arrival — with nothing anywhere on screen saying why.
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    fireEvent.press(getByTestId('goals-add'));
    fireEvent.press(getByTestId('goals-save'));

    await findByTestId('goals-invalid', {}, WAIT);
    expect(mockReplaceMyGoals).not.toHaveBeenCalled();
    expect(getByTestId('goals-target-1-input').props['aria-invalid']).toBe(true);
  });

  it('goes BUSY, never DISABLED, while the write is in flight', async () => {
    // `busy` is not `disabled` (`app/(join)/checkout.tsx`): a primary that greys
    // out the instant it is pressed reads as a rejection, and `busy` already
    // swallows the press.
    let release: (() => void) | undefined;
    mockReplaceMyGoals.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => {
            resolve({ goals: GOALS });
          };
        }),
    );
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    fireEvent.press(getByTestId('goals-save'));

    await waitFor(() => {
      expect(a11yState(getByTestId('goals-save')).busy).toBe(true);
    }, WAIT);
    expect(a11yState(getByTestId('goals-save')).disabled).toBe(false);
    release?.();
  });

  it('stops offering "add" once the set hits the server s cap of eight', async () => {
    mockGetMyGoals.mockResolvedValue({
      goals: Array.from({ length: 8 }, (_, index) => ({
        id: `g${String(index)}`,
        label: `Goal ${String(index)}`,
        current: 0,
        target: 10,
        unit: '',
      })),
    });
    const { findByTestId, queryByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-max', {}, WAIT);
    expect(queryByTestId('goals-add')).toBeNull();
  });
});

describe('§6', () => {
  it('skeletons while the set loads', () => {
    const { getByTestId } = renderApp(<GoalsScreen />);
    expect(getByTestId('goals-loading')).toBeTruthy();
  });

  it('empties with a first-goal action', async () => {
    mockGetMyGoals.mockResolvedValue({ goals: [] });
    const { findByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-empty', {}, WAIT);
  });

  it('errors with a working retry', async () => {
    mockGetMyGoals.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-error', {}, WAIT);
    mockGetMyGoals.mockResolvedValue({ goals: GOALS });
    fireEvent.press(getByTestId('goals-retry'));
    await findByTestId('goals-list', {}, WAIT);
    expect(mockGetMyGoals).toHaveBeenCalledTimes(2);
  });

  it('renders an offline branch', async () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<GoalsScreen />);
    await waitFor(() => {
      expect(getByTestId('goals-offline')).toBeTruthy();
    }, WAIT);
  });
});

describe('the chrome', () => {
  it('announces exactly one header — the screen title', async () => {
    const { findByTestId, getAllByRole } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    const headers = getAllByRole('header').map(
      (node) => (node as unknown as { props?: { children?: unknown } }).props?.children,
    );
    expect(headers).toEqual(['Your goals']);
  });

  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<GoalsScreen />, { locale });
      await screen.findByTestId('goals-list', {}, WAIT);
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/"member\.goals\./i);
      screen.unmount();
    }
  });
});

describe('the sticky footer', () => {
  // `Screen` positions its footer ABSOLUTELY over the scroll view and paints
  // nothing — the rule is stated on `ScreenProps.footer`. A footer that is a
  // bare `View` therefore lets the rows behind it draw straight through.
  it('paints an opaque plate', async () => {
    const { findByTestId, getByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-list', {}, WAIT);
    expect(paintsOpaquely(getByTestId('goals-footer-plate'))).toBe(true);
  });

  // The empty state ships its own primary "Add your first goal"; a second,
  // permanently disabled Save stuck under it is a control that can never act.
  it('is absent on the empty state, which has its own CTA', async () => {
    mockGetMyGoals.mockResolvedValue({ goals: [] });
    const { findByTestId, queryByTestId } = renderApp(<GoalsScreen />);
    await findByTestId('goals-empty', {}, WAIT);
    expect(queryByTestId('goals-footer-plate')).toBeNull();
    expect(queryByTestId('goals-save')).toBeNull();
  });
});
