// `/profile/bookings` — the history, the cancel, and the one thing a member
// cannot cancel.
//
// The asymmetry asserted at the bottom is the point of this file: a member holds
// `ClassBook` and can release a class seat, and does NOT hold `ClassWrite`, so
// `admin/service-sessions/:id/cancel` is closed to them (plan §7). A cancel
// button on a PT session would be a guaranteed 403, and it is exactly the kind
// of symmetry a later contributor adds without checking.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor, within } from '@testing-library/react-native';
import type { MemberBookingHistoryEntry } from '@fit/types';

import BookingsScreen from './bookings';
import { renderApp } from '../../../test-support/render';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };
const DAY = 86_400_000;
/** The sheet's own title sits inside its accessibility node. */
const HIDDEN = { includeHiddenElements: true } as const;

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockListMyBookings = jest.fn();
const mockCancelBooking = jest.fn();
jest.mock('../../../lib/api/bookings', () => ({
  listMyBookings: () => mockListMyBookings() as unknown,
  cancelBooking: (input: unknown) => mockCancelBooking(input) as unknown,
  bookClass: () => Promise.resolve({}),
}));

const mockCreateReview = jest.fn();
jest.mock('../../../lib/api/reviews', () => ({
  createReview: (input: unknown) => mockCreateReview(input) as unknown,
  listTrainerReviews: () =>
    Promise.resolve({ reviews: [], avgRating: 0, total: 0, page: 1, limit: 10 }),
}));

const mockListMyServiceSessions = jest.fn();
jest.mock('../../../lib/api/service-sessions', () => ({
  listMyServiceSessions: () => mockListMyServiceSessions() as unknown,
  listServices: () => Promise.resolve({ services: [] }),
  listServiceSlots: () => Promise.resolve({ slots: [] }),
}));

function entry(
  overrides: Partial<MemberBookingHistoryEntry> & { bookingId: string; offsetDays: number },
): MemberBookingHistoryEntry {
  const { offsetDays, ...rest } = overrides;
  const startsAt = new Date(Date.now() + offsetDays * DAY).toISOString();
  return {
    status: 'BOOKED',
    waitlistPosition: null,
    bookedAt: new Date().toISOString(),
    classInstance: {
      id: `ci-${overrides.bookingId}`,
      title: 'Morning Spin',
      startsAt,
      endsAt: startsAt,
      trainerName: 'Nino',
      locationName: 'Main',
      capacity: 10,
      bookedCount: 4,
      category: 'Cardio',
      color: '#E4F26A',
      imageUrl: null,
      status: 'SCHEDULED',
    } as MemberBookingHistoryEntry['classInstance'],
    ...rest,
  };
}

const ROWS = [
  entry({ bookingId: 'up1', offsetDays: 1 }),
  entry({ bookingId: 'up2', offsetDays: 2, status: 'WAITLIST', waitlistPosition: 3 }),
  entry({ bookingId: 'past1', offsetDays: -3, status: 'ATTENDED' }),
];

beforeEach(() => {
  mockPush.mockClear();
  for (const fake of [
    mockListMyBookings,
    mockCancelBooking,
    mockListMyServiceSessions,
    mockCreateReview,
  ]) {
    fake.mockReset();
  }
  mockCreateReview.mockResolvedValue({ id: 'rev_1' });
  mockListMyBookings.mockResolvedValue({ bookings: ROWS });
  mockCancelBooking.mockResolvedValue({});
  mockListMyServiceSessions.mockResolvedValue({
    sessions: [
      {
        id: 'ss_1',
        serviceId: 'sv_1',
        serviceName: 'PT with Ana',
        serviceType: 'PERSONAL_TRAINING',
        staffName: 'Ana G.',
        startsAt: new Date(Date.now() + DAY).toISOString(),
        endsAt: new Date(Date.now() + DAY).toISOString(),
        status: 'BOOKED',
        invoice: null,
      },
    ],
  });
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

function headerTitles(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => (node as { props?: { children?: unknown } }).props?.children);
}

describe('the two halves of the history', () => {
  it('shows upcoming first, and switches to past', async () => {
    const { findByTestId, getByTestId, queryByTestId, getByText } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-row-up1', {}, WAIT);
    expect(getByTestId('bookings-row-up2')).toBeTruthy();
    expect(queryByTestId('bookings-row-past1')).toBeNull();

    fireEvent.press(getByText('Past'));
    await waitFor(() => {
      expect(getByTestId('bookings-row-past1')).toBeTruthy();
    }, WAIT);
    expect(queryByTestId('bookings-row-up1')).toBeNull();
  });

  it('counts every status, from one request', async () => {
    const { findByTestId, getByLabelText } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-stats', {}, WAIT);
    expect(getByLabelText('Upcoming: 2')).toBeTruthy();
    expect(getByLabelText('Attended: 1')).toBeTruthy();
    expect(getByLabelText('On waitlist: 1')).toBeTruthy();
    expect(getByLabelText('Bookings total: 3')).toBeTruthy();
  });

  it('spells the waitlist position into the row s one accessibility node', async () => {
    const { findByTestId } = renderApp(<BookingsScreen />);
    const row = await findByTestId('bookings-row-up2', {}, WAIT);
    expect(row.props.accessibilityLabel).toContain('Waitlist · #3');
  });

  it('distinguishes "never booked" from "nothing in this half"', async () => {
    mockListMyBookings.mockResolvedValue({ bookings: [] });
    const none = renderApp(<BookingsScreen />);
    await none.findByTestId('bookings-empty', {}, WAIT);
    none.unmount();

    // Rows exist, but none of them is in the past.
    mockListMyBookings.mockResolvedValue({
      bookings: [entry({ bookingId: 'up1', offsetDays: 1 })],
    });
    const half = renderApp(<BookingsScreen />);
    await half.findByTestId('bookings-row-up1', {}, WAIT);
    fireEvent.press(half.getByText('Past'));
    await half.findByTestId('bookings-empty-past', {}, WAIT);
  });
});

describe('cancelling', () => {
  it('confirms first, then releases the seat', async () => {
    const { findByTestId, getByTestId } = renderApp(<BookingsScreen />);
    fireEvent.press(await findByTestId('bookings-cancel-up1', {}, WAIT));
    fireEvent.press(getByTestId('bookings-confirm-confirm'));
    await waitFor(() => {
      expect(mockCancelBooking).toHaveBeenCalledWith({ classId: 'ci-up1' });
    }, WAIT);
  });

  it('offers no cancel on a PAST booking', async () => {
    const { findByTestId, getByText, queryByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-row-up1', {}, WAIT);
    fireEvent.press(getByText('Past'));
    await findByTestId('bookings-row-past1', {}, WAIT);
    expect(queryByTestId('bookings-cancel-past1')).toBeNull();
  });

  it('offers NO cancel on a PT session — a member cannot release one', async () => {
    // `admin/service-sessions/:id/cancel` is `ClassWrite`; a MEMBER token does
    // not hold it (plan §7). A button here would be a guaranteed 403.
    const { findByTestId, queryByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-session-ss_1', {}, WAIT);
    expect(queryByTestId('bookings-cancel-ss_1')).toBeNull();
    // …and the row is not even pressable, so there is nothing to discover.
    expect(queryByTestId('bookings-session-ss_1')?.props.accessibilityRole).not.toBe('button');
  });
});

describe('§6', () => {
  it('skeletons both lists', () => {
    const { getByTestId } = renderApp(<BookingsScreen />);
    expect(getByTestId('bookings-loading')).toBeTruthy();
    expect(getByTestId('bookings-sessions-loading')).toBeTruthy();
  });

  it('errors with a working retry', async () => {
    mockListMyBookings.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-error', {}, WAIT);
    mockListMyBookings.mockResolvedValue({ bookings: ROWS });
    fireEvent.press(getByTestId('bookings-retry'));
    await findByTestId('bookings-row-up1', {}, WAIT);
  });

  it('errors the SESSIONS list independently of the classes list', async () => {
    mockListMyServiceSessions.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-sessions-error', {}, WAIT);
    // The class list is unaffected — one dead upstream, one dead section.
    expect(getByTestId('bookings-row-up1')).toBeTruthy();
  });

  it('renders an offline branch', async () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<BookingsScreen />);
    await waitFor(() => {
      expect(getByTestId('bookings-offline')).toBeTruthy();
    }, WAIT);
  });

  it('empties the sessions list on its own terms', async () => {
    mockListMyServiceSessions.mockResolvedValue({ sessions: [] });
    const { findByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-sessions-empty', {}, WAIT);
  });
});

describe('the chrome', () => {
  it('announces the title, then the sessions section', async () => {
    const { findByTestId, getAllByRole } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-row-up1', {}, WAIT);
    expect(headerTitles(getAllByRole('header'))).toEqual(['My bookings', 'Sessions']);
  });

  it('opens the class from a row', async () => {
    const { findByTestId } = renderApp(<BookingsScreen />);
    fireEvent.press(await findByTestId('bookings-row-up1', {}, WAIT));
    expect(mockPush).toHaveBeenCalledWith('/classes/ci-up1');
  });

  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<BookingsScreen />, { locale });
      await screen.findByTestId('bookings-row-up1', {}, WAIT);
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/"account\.bookings\./i);
      screen.unmount();
    }
  });
});

// ===========================================================================
// THE REVIEW COMPOSER, AND WHERE IT IS *NOT* OFFERED.
//
// `POST /reviews` is accepted only with an `ATTENDED` booking for the
// occurrence (`403 NOT_ATTENDED`). This screen is the one place in the app that
// renders that status, so it is the one place where the composer can be offered
// only where it will be accepted. The negative assertions below are the point:
// a "rate this" button on a BOOKED row is a guaranteed 403, and it is exactly
// the kind of symmetry a later contributor adds without checking — the same
// argument this file already makes about cancelling a PT session.
// ===========================================================================
describe('reviewing an attended class', () => {
  it('offers the composer on an ATTENDED row, in the past half', async () => {
    const { findByTestId, getByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-row-up1', {}, WAIT);
    fireEvent.press(getByTestId('bookings-view-past'));
    await findByTestId('bookings-row-past1', {}, WAIT);
    expect(getByTestId('bookings-review-past1')).toBeTruthy();
  });

  it('offers it on NOTHING else — a BOOKED or WAITLIST row would 403', async () => {
    const { findByTestId, queryByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-row-up1', {}, WAIT);
    expect(queryByTestId('bookings-review-up1')).toBeNull();
    expect(queryByTestId('bookings-review-up2')).toBeNull();
  });

  it('opens the sheet against the row that was pressed', async () => {
    const { findByTestId, getByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-row-up1', {}, WAIT);
    fireEvent.press(getByTestId('bookings-view-past'));
    fireEvent.press(await findByTestId('bookings-review-past1', {}, WAIT));

    const sheet = await findByTestId('bookings-review', {}, WAIT);
    expect(sheet).toBeTruthy();
    // The composer names the occurrence it is against, because a member with
    // several attended classes has no other way to tell which one this is.
    //
    // Queried, not `JSON.stringify`d: serialising a `ReactTestInstance` walks
    // the fiber, and how far it gets before it meets a circular context is a
    // fact about where the component happens to sit in the tree — this one
    // moved into `components/classes/my-bookings-view.tsx` and the stringify
    // started throwing while the sheet rendered exactly the same words.
    expect(within(sheet).getByText(/Morning Spin/, HIDDEN)).toBeTruthy();
  });

  it('never has two sheets open at once', async () => {
    // `Sheet` is single-instance per screen — two `Modal`s whose `visible`
    // overlaps for one frame flash black on iOS — and the screen holds ONE
    // discriminated `sheet`, so opening the composer cannot leave the cancel
    // confirmation mounted behind it.
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<BookingsScreen />);
    fireEvent.press(await findByTestId('bookings-cancel-up1', {}, WAIT));
    await findByTestId('bookings-confirm', {}, WAIT);

    fireEvent.press(getByTestId('bookings-view-past'));
    fireEvent.press(await findByTestId('bookings-review-past1', {}, WAIT));
    await findByTestId('bookings-review', {}, WAIT);
    await waitFor(() => {
      expect(queryByTestId('bookings-confirm')).toBeNull();
    }, WAIT);
  });

  it('a posted review turns the row into a state, not a second button', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<BookingsScreen />);
    await findByTestId('bookings-row-up1', {}, WAIT);
    fireEvent.press(getByTestId('bookings-view-past'));
    fireEvent.press(await findByTestId('bookings-review-past1', {}, WAIT));

    fireEvent.press(await findByTestId('bookings-review-rating-5', {}, WAIT));
    fireEvent.press(getByTestId('bookings-review-submit'));

    // `409 ALREADY_REVIEWED` is the only thing a second attempt could earn, and
    // no member-reachable route could have told us in advance — so the row
    // remembers the answer the server just gave.
    await findByTestId('bookings-reviewed-past1', {}, WAIT);
    expect(queryByTestId('bookings-review-past1')).toBeNull();
  });
});
