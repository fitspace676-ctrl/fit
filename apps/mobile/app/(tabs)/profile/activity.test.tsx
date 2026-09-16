// `/profile/activity` — the counters and the achievement rail, on their own.
//
// Every assertion below was in `profile/index.test.tsx` until 2026-09-05 and
// moved here with the blocks it covers, unaltered in substance: the two figures
// the API can actually answer, the absent streak, the rail's top alignment and
// the spoken earned/locked state. What is new is the screen's own chrome and
// its four §6 branches, which the section did not own when it was one of five
// on Profile.
//
// The transport is mocked and everything above it is real, for the reason
// `home.test.tsx` gives at length: mocking the hooks would let a test assert a
// state the query library cannot produce.
//
// `renderApp`, not `renderScreen`: `Screen` and the query client are both real.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';

import ActivityScreen from './activity';
import { renderApp } from '../../../test-support/render';
import { flatStyle } from '../../../test-support/style';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };
const DAY = 86_400_000;

const mockPush = jest.fn();
const mockBack = jest.fn();
const mockReplace = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockListMyBookings = jest.fn();
jest.mock('../../../lib/api/bookings', () => ({
  listMyBookings: () => mockListMyBookings() as unknown,
}));

/** One attended booking and one still to come — "1 visit, 2 classes". */
function seed() {
  mockListMyBookings.mockResolvedValue({
    bookings: [
      {
        bookingId: 'b1',
        status: 'ATTENDED',
        waitlistPosition: null,
        bookedAt: new Date().toISOString(),
        classInstance: {
          id: 'ci1',
          title: 'Spin',
          startsAt: new Date(Date.now() - DAY).toISOString(),
          endsAt: new Date(Date.now() - DAY).toISOString(),
          trainerName: 'Ana',
          locationName: 'Main',
          capacity: 10,
          bookedCount: 4,
          category: 'Cardio',
          color: '#E4F26A',
          imageUrl: null,
          status: 'COMPLETED',
        },
      },
      {
        bookingId: 'b2',
        status: 'BOOKED',
        waitlistPosition: null,
        bookedAt: new Date().toISOString(),
        classInstance: {
          id: 'ci2',
          title: 'Yoga',
          startsAt: new Date(Date.now() + DAY).toISOString(),
          endsAt: new Date(Date.now() + DAY).toISOString(),
          trainerName: 'Ana',
          locationName: 'Main',
          capacity: 10,
          bookedCount: 4,
          category: 'Mind',
          color: '#E4F26A',
          imageUrl: null,
          status: 'SCHEDULED',
        },
      },
    ],
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockReplace.mockClear();
  mockCanGoBack = true;
  mockListMyBookings.mockReset();
  seed();
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

/** The text of every `accessibilityRole="header"`, in tree order. */
function headerTitles(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => (node as { props?: { children?: unknown } }).props?.children);
}

describe('the figures', () => {
  it('counts only what the API can actually answer', async () => {
    const { findByTestId, getByLabelText, queryByText } = renderApp(<ActivityScreen />);
    await findByTestId('profile-stats', {}, WAIT);
    expect(getByLabelText('Total visits: 1')).toBeTruthy();
    expect(getByLabelText('Classes: 2')).toBeTruthy();
    // No day-streak tile: there is no member-readable check-in log.
    expect(queryByText('Day streak')).toBeNull();
  });

  it('earns achievements from the attended count, and ships no streak badge', async () => {
    const { findByTestId, queryByTestId } = renderApp(<ActivityScreen />);
    await findByTestId('profile-achievements-firstClass', {}, WAIT);
    expect(queryByTestId('profile-achievements-streak')).toBeNull();
  });

  // ==========================================================================
  // A RAIL OF UNEQUAL TILES MUST TOP-ALIGN, NOT CENTRE.
  //
  // `ScrollRail` centres its items — correct for the week strip's identical
  // 76pt cells and for a run of identical chips, where centring and
  // top-aligning draw the same picture. Achievement captions wrap, so the
  // two-line first tile is 16pt taller than its neighbours and centring pushed
  // it 8pt UP: the plates did not line up across the row and neither did the
  // captions. Fixed at the call site, because the default is right for the
  // component's other three consumers.
  // ==========================================================================
  it('top-aligns the achievement rail, whose tiles are not the same height', async () => {
    const { findByTestId, getByTestId } = renderApp(<ActivityScreen />);
    await findByTestId('profile-achievements-firstClass', {}, WAIT);
    const rail = getByTestId('profile-achievements-rail');
    const content = flatStyle({ props: { style: rail.props.contentContainerStyle } });
    expect(content.alignItems).toBe('flex-start');
  });

  it('speaks each achievement s earned state, which is otherwise only a colour', async () => {
    const { findByTestId } = renderApp(<ActivityScreen />);
    const earned = await findByTestId('profile-achievements-firstClass', {}, WAIT);
    const locked = await findByTestId('profile-achievements-tenVisits', {}, WAIT);
    // TODO(i18n): English placeholders — see `components/home/pending-copy.ts`.
    expect(earned.props.accessibilityValue).toEqual({ text: 'Earned' });
    expect(locked.props.accessibilityValue).toEqual({ text: 'Not earned yet' });
  });
});

describe('§6', () => {
  it('skeletons rather than blanking the screen', () => {
    expect(renderApp(<ActivityScreen />).getByTestId('activity-stats-loading')).toBeTruthy();
  });

  it('shows an error with a working retry', async () => {
    mockListMyBookings.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<ActivityScreen />);
    await findByTestId('activity-stats-error', {}, WAIT);

    seed();
    // NEVER `.refetch()` — the retry invalidates `queryKeys.bookings`, the same
    // root every booking mutation writes through.
    fireEvent.press(getByTestId('activity-stats-retry'));
    await findByTestId('profile-stats', {}, WAIT);
    expect(mockListMyBookings).toHaveBeenCalledTimes(2);
  });

  it('renders an OFFLINE branch rather than skeletons forever', async () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<ActivityScreen />);
    await waitFor(() => {
      expect(getByTestId('activity-offline')).toBeTruthy();
    }, WAIT);
    expect(getByTestId('activity-stats-offline')).toBeTruthy();
    expect(mockListMyBookings).not.toHaveBeenCalled();
  });
});

describe('the chrome', () => {
  it('announces the screen title, then the rail s heading', async () => {
    const { findByTestId, getAllByRole } = renderApp(<ActivityScreen />);
    await findByTestId('profile-achievements-firstClass', {}, WAIT);
    expect(headerTitles(getAllByRole('header'))).toEqual(['My activity', 'Achievements']);
  });

  it('goes back to where the user came from', async () => {
    const { findByTestId } = renderApp(<ActivityScreen />);
    fireEvent.press(await findByTestId('activity-back', {}, WAIT));
    expect(mockBack).toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('falls back to the Profile root when there is no stack to pop', async () => {
    // A `fit://profile/activity` cold launch: `back()` has nowhere to go.
    mockCanGoBack = false;
    const { findByTestId } = renderApp(<ActivityScreen />);
    fireEvent.press(await findByTestId('activity-back', {}, WAIT));
    expect(mockReplace).toHaveBeenCalledWith('/profile');
    expect(mockBack).not.toHaveBeenCalled();
  });
});

describe('localisation', () => {
  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<ActivityScreen />, { locale });
      await screen.findByTestId('profile-stats', {}, WAIT);
      const json = JSON.stringify(screen.toJSON());
      expect(json).not.toMatch(/"member\.profile\./i);
      expect(json).not.toMatch(/"notifications\.[a-z]/i);
    }
  });
});
