// The classes list — one test per branch of plan §6, plus the two behaviours
// that are the whole reason this screen was rebuilt.
//
// THE TWO THAT MATTER MOST are the signed-out ones. The deleted app bounced
// every signed-out user to `/login`, which made discovery unreachable and a
// signed-out purchase impossible; §1 names it as one of three foundations that
// were wrong. So: the schedule renders with no session, AND pressing Book
// navigates to sign-in with a `next=` pointing at the class — never a redirect
// on mount.
//
// `getAllByRole('header')` is asserted as an ORDERED LIST, per the amendment to
// §6 item 7: React Native has no `accessibilityLevel`, so every `Heading` emits
// a bare `role="header"` and a screen with sections legitimately has several.
// `UNSAFE_root.findAll` would walk composite instances and count one `Heading`
// three times.
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { ScrollView } from 'react-native';
import { ToastProvider } from '@fit/ui-mobile';
import type { ReactElement } from 'react';

import ClassesScreen from './index';
import { renderScreen } from '../../../test-support/render-screen';
import { flatStyle } from '../../../test-support/style';

// ── The router ─────────────────────────────────────────────────────────────
const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), canGoBack: () => true }),
}));

// ── The session, and the gym it does (or does not) carry ───────────────────
let mockSession = {
  status: 'signed-in' as 'hydrating' | 'signed-out' | 'signed-in',
  userId: 'usr_1' as string | null,
  gymId: 'gym_1' as string | null,
  role: 'MEMBER' as string | null,
  expiresAt: null as number | null,
};
jest.mock('../../../hooks/useSession', () => ({ useSession: () => mockSession }));
jest.mock('../../../hooks/useActiveGym', () => ({ useGymId: () => mockSession.gymId }));
jest.mock('../../../lib/auth/session', () => ({ resolveGymSlug: () => 'downtown-strength' }));

let mockGymQuery = {
  data: { gymId: 'gym_public', name: 'Downtown Strength' } as
    | { gymId: string; name: string }
    | undefined,
  isPending: false,
  isError: false,
};
jest.mock('../../../hooks/queries/useGym', () => ({ useGymBySlug: () => mockGymQuery }));

// ── The two reads ──────────────────────────────────────────────────────────
//
// `classesQueryOptions` is mocked rather than the fetcher beneath it, because
// the screen calls that factory directly — it is the seam that lets a PUBLIC
// screen pass a gym id the session does not have. The mock keeps the factory's
// contract (`enabled` false without a gym) so the signed-out path is exercised
// for real.
const mockClasses: { instances: unknown[] } = { instances: [] };
jest.mock('../../../hooks/queries/useClasses', () => ({
  classesQueryOptions: (gymId: string | null) => ({
    queryKey: ['classes', gymId ?? '', 'list', 'test'],
    queryFn: () =>
      mockClassesErrorRef.current === null
        ? Promise.resolve(mockClasses)
        : Promise.reject(mockClassesErrorRef.current),
    enabled: gymId !== null && !mockPausedRef.current,
  }),
}));
// `jest.mock` factories may not close over a non-`mock`-prefixed binding, and a
// `let` read at call time still has to reach them — so the mutable halves live
// behind these two boxes.
const mockClassesErrorRef = { current: null as Error | null };
const mockPausedRef = { current: false };

let mockBookings: { bookings: unknown[] } | undefined = { bookings: [] };
// The FULL query slice, not just `data`: the screen folds `/me/bookings` into
// its phase (`combinePhases`), because without the member's own seats every
// card would assert "not booked" on no evidence.
let mockBookingsState: {
  isPending: boolean;
  isError: boolean;
  fetchStatus: 'fetching' | 'paused' | 'idle';
} = { isPending: false, isError: false, fetchStatus: 'idle' };
jest.mock('../../../hooks/queries/useBookings', () => ({
  useMyBookings: () => ({ data: mockBookings, ...mockBookingsState }),
}));

// ── The bookings TAB's third read ──────────────────────────────────────────
//
// `MyBookingsView` is mounted by the second tab, and it brings a PT-sessions
// query with it. That list is not what this file is about —
// `profile/bookings.test.tsx` exercises it against the real hook — so it is
// stubbed to its quietest honest answer and the tab tests assert the switch.
//
// `hooks/mutations/useBookingMutations` is deliberately NOT mocked: the same
// module gives `useClassBooking` its `useBookClass`, and a factory that
// replaces the module breaks the schedule half of this very screen.
jest.mock('../../../hooks/queries/useServices', () => ({
  useMyServiceSessions: () => ({
    data: { sessions: [] },
    isPending: false,
    isError: false,
    fetchStatus: 'idle',
  }),
}));

// ── The radio ──────────────────────────────────────────────────────────────
let mockOnline = true;
jest.mock('../../../components/auth/use-online', () => ({ useIsOnline: () => mockOnline }));

/** A card the screen can render, on a fixed local Thursday. */
function card(over: Partial<Record<string, unknown>> & { hour: number }) {
  const startsAt = new Date(2026, 7, 6, over.hour, 0);
  return {
    id: (over.id as string | undefined) ?? `c-${String(over.hour)}`,
    title: (over.title as string | undefined) ?? 'Spin Express',
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
    trainerName: (over.trainerName as string | undefined) ?? 'Sandro K.',
    locationName: (over.locationName as string | undefined) ?? 'Main Floor',
    capacity: (over.capacity as number | undefined) ?? 24,
    bookedCount: (over.bookedCount as number | undefined) ?? 20,
    category: (over.category as string | undefined) ?? 'Spin',
    color: '#8F8F8B',
    imageUrl: (over.imageUrl as string | null | undefined) ?? null,
  };
}

/** The screen inside the one provider `renderScreen` does not mount. */
function screen(): ReactElement {
  return (
    <ToastProvider>
      <ClassesScreen />
    </ToastProvider>
  );
}

/** The text of every `accessibilityRole="header"`, in tree order. */
function headers(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => (node as { props?: { children?: unknown } }).props?.children);
}

beforeEach(() => {
  jest.useFakeTimers();
  // The whole suite pretends it is Thursday 6 August 2026, 09:00 local, so the
  // week the screen opens on is the week the fixtures are in.
  jest.setSystemTime(new Date(2026, 7, 6, 9, 0));
  mockPush.mockClear();
  mockSession = {
    status: 'signed-in',
    userId: 'usr_1',
    gymId: 'gym_1',
    role: 'MEMBER',
    expiresAt: null,
  };
  mockGymQuery = {
    data: { gymId: 'gym_public', name: 'Downtown Strength' },
    isPending: false,
    isError: false,
  };
  mockClasses.instances = [];
  mockClassesErrorRef.current = null;
  mockPausedRef.current = false;
  mockBookings = { bookings: [] };
  mockBookingsState = { isPending: false, isError: false, fetchStatus: 'idle' };
  mockOnline = true;
});

afterEach(() => {
  jest.useRealTimers();
});

/** Let the query settle. */
async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/**
 * The ceiling on every `waitFor` here.
 *
 * RNTL's default is 1000ms, which is tight on a loaded machine — each of these
 * waits on a real query round trip through TanStack's notify batching, and a
 * timeout there reports as "element not found" rather than as "too slow",
 * which is the flake that gets a test deleted instead of fixed.
 */
const WAIT = { timeout: 10_000 } as const;

// Jest's per-test default is 5s, which is the SAME budget as a generous
// `waitFor` — so a slow box does not report "still waiting", it reports the
// test timing out at the `waitFor` line, which reads like a broken assertion.
// Raising the test ceiling above the wait ceiling is what makes the failure
// mode legible; nothing here waits anywhere near either number in practice.
jest.setTimeout(30_000);

describe('the frame', () => {
  it('titles itself from `member.classes`, in both locales, and names its headers in order', async () => {
    mockClasses.instances = [card({ hour: 8, id: 'a' }), card({ hour: 18, id: 'b' })];
    const view = renderScreen(screen());
    await settle();

    expect(view.getByTestId('classes-screen')).toBeTruthy();
    await waitFor(() => {
      expect(headers(view.getAllByRole('header'))).toEqual(['Classes', 'Morning', 'Evening']);
    }, WAIT);

    view.unmount();
    const ka = renderScreen(screen(), { locale: 'ka' });
    await settle();
    expect(ka.queryByText('Classes')).toBeNull();
    // A key that resolved to nothing would render its own dot-path.
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/member\.classes\./);
  });

  it('draws a week strip whose dot and spoken label agree about the count', async () => {
    mockClasses.instances = [card({ hour: 8, id: 'a' }), card({ hour: 18, id: 'b' })];
    const view = renderScreen(screen());
    await settle();

    // Wait for the week to land: the strip renders from mount, so reading its
    // label before the query settles would assert against an empty schedule.
    await view.findByTestId('classes-card-a');
    const thursday = view.getByTestId('classes-day-2026-08-06');
    // The dot is the only thing on the cell that says a day has classes — and
    // it is deliberately hidden from the accessibility tree, which is why the
    // query has to opt in. (That is the whole reason the count also has to be
    // spelled out in the label below.)
    expect(
      view.getByTestId('classes-day-2026-08-06-dot', { includeHiddenElements: true }),
    ).toBeTruthy();
    expect(
      (thursday as unknown as { props: { accessibilityLabel: string } }).props.accessibilityLabel,
    ).toBe('Today, Thursday, August 6, 2 classes');

    // A day with nothing on it still has a cell, and still says so.
    expect(
      (
        view.getByTestId('classes-day-2026-08-05') as unknown as {
          props: { accessibilityLabel: string };
        }
      ).props.accessibilityLabel,
    ).toBe('Wednesday, August 5, 0 classes');
  });

  it('steps the week, and takes the selected day with it', async () => {
    mockClasses.instances = [card({ hour: 8, id: 'a' })];
    const view = renderScreen(screen());
    await settle();

    fireEvent.press(view.getByTestId('classes-next-week'));
    await settle();
    // The strip now shows the following Monday…
    expect(view.getByTestId('classes-day-2026-08-10')).toBeTruthy();
    // …and the day the cards are drawn for moved with it, so the strip and the
    // list can never show two different weeks.
    expect(view.queryByTestId('classes-day-2026-08-06')).toBeNull();
  });
});

// ===========================================================================
// THE SECOND TAB. "What is on?" and "what am I in?" are asked one after the
// other, so they are one screen apart rather than three taps apart through
// Profile — and the content is the SAME component `/profile/bookings` renders.
//
// What is asserted here is the seam, not the list: that the two halves swap,
// that the schedule's filter goes with its own tab, and that the filter sheet
// cannot be left open behind the two the bookings view brings (`Sheet` is
// single-instance per screen). The list's own branches belong to
// `profile/bookings.test.tsx`, against the real hooks.
// ===========================================================================
describe('the two tabs', () => {
  it('swaps the schedule for the member’s own bookings, and back', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a' })];
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('classes-card-a');

    fireEvent.press(view.getByTestId('classes-tabs-bookings'));
    await settle();

    // The bookings view is up — its own upcoming/past segment is the tell —
    // and the whole schedule, week strip included, is gone.
    expect(await view.findByTestId('bookings-view', {}, WAIT)).toBeTruthy();
    expect(view.queryByTestId('classes-card-a')).toBeNull();
    expect(view.queryByTestId('classes-week')).toBeNull();

    fireEvent.press(view.getByTestId('classes-tabs-classes'));
    await settle();
    expect(await view.findByTestId('classes-card-a', {}, WAIT)).toBeTruthy();
    expect(view.queryByTestId('bookings-view')).toBeNull();
  });

  it('takes the filter button away with the schedule, and closes its sheet', async () => {
    // The filter narrows the LIST. Left in the AppBar on the bookings tab it
    // opens a sheet of chips against something that is not on screen — and it
    // would be a third `Modal` over the two the bookings view owns.
    mockClasses.instances = [card({ hour: 18, id: 'a', category: 'Spin' })];
    const view = renderScreen(screen());
    await settle();

    fireEvent.press(view.getByTestId('classes-filter-button'));
    expect(await view.findByTestId('classes-filters')).toBeTruthy();

    fireEvent.press(view.getByTestId('classes-tabs-bookings'));
    await settle();
    expect(view.queryByTestId('classes-filter-button')).toBeNull();
    expect(view.queryByTestId('classes-filters')).toBeNull();

    fireEvent.press(view.getByTestId('classes-tabs-classes'));
    await settle();
    expect(view.getByTestId('classes-filter-button')).toBeTruthy();
    // And it came back CLOSED, not holding the state it was switched away from.
    expect(view.queryByTestId('classes-filters')).toBeNull();
  });

  it('names both tabs from the catalogue, in either locale', async () => {
    const view = renderScreen(screen());
    await settle();
    // Read off the spoken name rather than the glyphs: "Classes" is on screen
    // twice — the AppBar title and the tab — and only one of them is a control.
    const spoken = (id: string) =>
      (view.getByTestId(id) as unknown as { props: { accessibilityLabel: string } }).props
        .accessibilityLabel;
    expect(spoken('classes-tabs-classes')).toBe('Classes');
    expect(spoken('classes-tabs-bookings')).toBe('My bookings');
    expect(
      (view.getByTestId('classes-tabs') as unknown as { props: { accessibilityLabel: string } })
        .props.accessibilityLabel,
    ).toBe('Classes or my bookings');

    view.unmount();
    const ka = renderScreen(screen(), { locale: 'ka' });
    await settle();
    fireEvent.press(ka.getByTestId('classes-tabs-bookings'));
    await settle();
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/member\.classes\./);
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/account\.bookings\./);
  });
});

describe('the five states', () => {
  it('loads as skeletons, not a spinner', () => {
    mockGymQuery = { data: undefined, isPending: true, isError: false };
    mockSession.gymId = null;
    const view = renderScreen(screen());
    expect(view.getByTestId('classes-loading')).toBeTruthy();
    expect(view.queryByTestId('classes-empty')).toBeNull();
  });

  it('renders the empty day with its own copy, and no filter affordance', async () => {
    const view = renderScreen(screen());
    await settle();
    const empty = await view.findByTestId('classes-empty');
    expect(empty).toBeTruthy();
    expect(view.getByText('No classes today')).toBeTruthy();
    expect(view.queryByTestId('classes-clear-filters')).toBeNull();
  });

  it('separates "your filters exclude everything" from "nothing is on", with a one-tap clear', async () => {
    mockClasses.instances = [card({ hour: 8, id: 'a', category: 'Spin' })];
    const view = renderScreen(screen());
    await settle();

    fireEvent.press(await view.findByTestId('classes-category-Spin'));
    // Selected, so still visible.
    expect(view.queryByTestId('classes-no-match')).toBeNull();

    fireEvent.press(view.getByTestId('classes-filter-button'));
    fireEvent.press(await view.findByTestId('classes-filters-trainer-Sandro K.'));
    fireEvent.press(view.getByTestId('classes-filters-apply'));
    // Now narrowed to a trainer who is on this class — still one card.
    expect(view.queryByTestId('classes-no-match')).toBeNull();

    // Narrow to a day with nothing on it: the filters are active, so it is the
    // no-match state, not the empty one.
    fireEvent.press(view.getByTestId('classes-day-2026-08-05'));
    expect(view.getByTestId('classes-no-match')).toBeTruthy();
    fireEvent.press(view.getByTestId('classes-clear-filters'));
    expect(view.getByTestId('classes-empty')).toBeTruthy();
  });

  it('shows an error box with a retry that actually refetches', async () => {
    mockClassesErrorRef.current = new Error('boom');
    const view = renderScreen(screen());
    await waitFor(() => {
      expect(view.getByTestId('classes-error')).toBeTruthy();
    }, WAIT);
    expect(view.getByText('We couldn’t load the classes. Please try again.')).toBeTruthy();

    // The retry is `invalidateQueries`, never `.refetch()` — so proving it works
    // means proving the query runs again and the screen leaves the error state.
    mockClassesErrorRef.current = null;
    mockClasses.instances = [card({ hour: 8, id: 'a' })];
    fireEvent.press(view.getByTestId('classes-retry'));
    await waitFor(() => {
      expect(view.queryByTestId('classes-error')).toBeNull();
    }, WAIT);
    expect(view.getByTestId('classes-card-a')).toBeTruthy();
  });

  it('says so when the radio is dead, rather than skeletoning forever', async () => {
    // `onlineManager` PAUSES a query instead of failing it, so without this
    // branch the screen sits `isPending` with no error to render.
    mockOnline = false;
    mockPausedRef.current = true;
    const view = renderScreen(screen());
    await settle();
    expect(view.getByTestId('classes-offline')).toBeTruthy();
    expect(view.queryByTestId('classes-loading')).toBeNull();
    expect(view.queryByTestId('classes-error')).toBeNull();
  });
});

describe('signed out', () => {
  beforeEach(() => {
    mockSession = {
      status: 'signed-out',
      userId: null,
      gymId: null,
      role: null,
      expiresAt: null,
    };
  });

  it('does NOT skeleton on the disabled `/me/bookings` — signed out, `{}` is the truth', async () => {
    // `useMyBookings` is `gymScope`d by the SESSION's gym, so signed out it is
    // DISABLED: `isPending` true, `fetchStatus` idle, forever. Reading that as
    // "loading" would put the public schedule behind a permanent skeleton,
    // which is the very forever-skeleton the discovery-gym seam exists to stop.
    mockClasses.instances = [card({ hour: 18, id: 'a' })];
    mockBookings = undefined;
    mockBookingsState = { isPending: true, isError: false, fetchStatus: 'idle' };
    const view = renderScreen(screen());
    await settle();

    await view.findByTestId('classes-card-a');
    expect(view.queryByTestId('classes-loading')).toBeNull();
    expect(view.queryByTestId('classes-error')).toBeNull();
  });

  it('renders the whole schedule — the old guard bounced this user to /login', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a', title: 'Spin Express' })];
    const view = renderScreen(screen());
    await settle();

    // The gym came from the PUBLIC tenant lookup, not from a token.
    await view.findByTestId('classes-card-a');
    // `includeHiddenElements` because the card's whole content region is ONE
    // accessibility node and everything inside it is decorative — which is the
    // reason the seat count has to be repeated in `accessibilityLabel`.
    expect(view.getByText('Spin Express', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByLabelText(/Spin Express/)).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('prompts at the Book button, and returns to the class it was pressed on', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a' })];
    const view = renderScreen(screen());
    await settle();

    fireEvent.press(await view.findByTestId('classes-card-a-action'));
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fclasses%2Fa');
    // And no confirm sheet opened behind the prompt.
    expect(view.queryByTestId('class-booking-confirm')).toBeNull();
  });
});

describe('the cards', () => {
  it('opens the class from the content region and books from the button', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a' })];
    const view = renderScreen(screen());
    await settle();

    fireEvent.press(await view.findByTestId('classes-card-a'));
    expect(mockPush).toHaveBeenCalledWith('/classes/a');

    mockPush.mockClear();
    fireEvent.press(view.getByTestId('classes-card-a-action'));
    // Signed in, so this opens the sheet rather than navigating.
    expect(mockPush).not.toHaveBeenCalled();
    expect(view.getByTestId('class-booking-confirm')).toBeTruthy();
  });

  it('reads the member’s own booking off `/me/bookings` and shows the booked state', async () => {
    const instance = card({ hour: 18, id: 'a' });
    mockClasses.instances = [instance];
    mockBookings = {
      bookings: [
        {
          bookingId: 'b1',
          status: 'BOOKED',
          waitlistPosition: null,
          bookedAt: instance.startsAt,
          classInstance: {
            ...instance,
            description: '',
            durationMinutes: 45,
            room: '',
            status: 'SCHEDULED',
          },
        },
      ],
    };
    const view = renderScreen(screen());
    await settle();
    expect(await view.findByText('Booked')).toBeTruthy();
  });

  it('REFUSES to say "Book" when `/me/bookings` failed — the error box, not a lie', async () => {
    // The central failure this rebuild exists to stop: a status derived from
    // the ABSENCE of data in a query nobody checked. `bookingsByClassId(undefined)`
    // returns `{}`, every lookup misses, and every card claims "not booked" —
    // a claim with a button attached, answered by `409 ALREADY_BOOKED`.
    mockClasses.instances = [card({ hour: 18, id: 'a' })];
    mockBookings = undefined;
    mockBookingsState = { isPending: false, isError: true, fetchStatus: 'idle' };
    const view = renderScreen(screen());
    await settle();

    await waitFor(() => {
      expect(view.getByTestId('classes-error')).toBeTruthy();
    }, WAIT);
    expect(view.queryByTestId('classes-card-a')).toBeNull();
    expect(view.queryByText('Book')).toBeNull();
  });

  it('SKELETONS while `/me/bookings` is still in flight, rather than guessing', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a' })];
    mockBookings = undefined;
    mockBookingsState = { isPending: true, isError: false, fetchStatus: 'fetching' };
    const view = renderScreen(screen());
    await settle();

    await waitFor(() => {
      expect(view.getByTestId('classes-loading')).toBeTruthy();
    }, WAIT);
    expect(view.queryByTestId('classes-card-a')).toBeNull();
  });

  it('ignores a CANCELED booking — a class the member gave up is bookable again', async () => {
    const instance = card({ hour: 18, id: 'a' });
    mockClasses.instances = [instance];
    mockBookings = {
      bookings: [
        {
          bookingId: 'b1',
          status: 'CANCELED',
          waitlistPosition: null,
          bookedAt: instance.startsAt,
          classInstance: {
            ...instance,
            description: '',
            durationMinutes: 45,
            room: '',
            status: 'SCHEDULED',
          },
        },
      ],
    };
    const view = renderScreen(screen());
    await settle();
    expect(await view.findByText('Book')).toBeTruthy();
    expect(view.queryByText('Booked')).toBeNull();
  });

  // ------------------------------------------------------------------------
  // THE COVER. `imageUrl` is on the CARD contract, so the list can draw a
  // photograph without a request per row — and it is null for most classes,
  // where the card is the card it has always been.
  // ------------------------------------------------------------------------
  // The cover is DECORATION — hidden from the accessibility tree, since the
  // card already announces itself in one sentence — so every query for it has
  // to look inside that silence.
  const HIDDEN = { includeHiddenElements: true } as const;

  it('draws the cover photo the wire ships, behind the card it belongs to', async () => {
    mockClasses.instances = [
      card({ hour: 18, id: 'a', imageUrl: 'https://images.example.com/yoga.jpg' }),
    ];
    const view = renderScreen(screen());
    await settle();

    const image = await view.findByTestId('classes-card-a-cover-image', HIDDEN);
    expect(image.props.source).toEqual({ uri: 'https://images.example.com/yoga.jpg' });
    expect(view.getByTestId('classes-card-a-cover-scrim', HIDDEN)).toBeTruthy();
  });

  it('draws no image node at all for a class with no photo', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a' })];
    const view = renderScreen(screen());
    await settle();

    await view.findByTestId('classes-card-a');
    expect(view.queryByTestId('classes-card-a-cover-image', HIDDEN)).toBeNull();
    expect(view.queryByTestId('classes-card-a-cover-scrim', HIDDEN)).toBeNull();
  });

  it('offers the waitlist, never "0 left", once the class is full', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a', capacity: 12, bookedCount: 12 })];
    const view = renderScreen(screen());
    await settle();

    // "Full" lives in the spots pill, which sits INSIDE the card's single
    // accessibility node — which is exactly why the word has to be in the
    // spoken label too. Both are asserted here.
    await view.findByTestId('classes-card-a');
    expect(view.getByText('Full', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByLabelText(/Full/)).toBeTruthy();
    // The action is a real, visible button and it offers the waitlist.
    expect(view.getByText('Waitlist')).toBeTruthy();
    // Never "0 left" — `isClassFull` is `<= 0`, not `=== 0`.
    expect(view.queryByText('0 left', { includeHiddenElements: true })).toBeNull();
  });
});

describe('the filter button', () => {
  it('carries a count badge only while something is narrowing the list', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a', category: 'Spin' })];
    const view = renderScreen(screen());
    await settle();

    const button = view.getByTestId('classes-filter-button');
    const selected = (node: unknown) =>
      (node as { props: { accessibilityState?: { selected?: boolean } } }).props.accessibilityState
        ?.selected;
    expect(selected(button)).toBeFalsy();

    fireEvent.press(await view.findByTestId('classes-category-Spin'));
    expect(selected(view.getByTestId('classes-filter-button'))).toBe(true);
    // The category counts toward the badge, exactly as the artboard has it.
    expect(view.getByText('1')).toBeTruthy();
  });
});

describe('the filter sheet', () => {
  // ==========================================================================
  // AN UNSELECTED CHIP MUST BE A CHIP.
  //
  // `Chip` defaults to `tone="surface"` — `backgroundCard`, which in dark mode
  // is ink-900 — and a sheet panel is `backgroundSurface`, which is ALSO
  // ink-900. So six trainer and location names shipped as bare grey text
  // floating on the panel with no plate under any of them. `chip.tsx`
  // documents the pair for this case: `quiet` (one surface higher) with
  // `selectedFill="accent"` (the lime is free inside a sheet).
  // ==========================================================================
  it('draws every chip on a plate the panel does not share', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a', category: 'Spin' })];
    const view = renderScreen(screen());
    await settle();

    fireEvent.press(view.getByTestId('classes-filter-button'));
    const panel = flatStyle(await view.findByTestId('classes-filters')).backgroundColor;
    expect(panel).toBeTruthy();

    for (const id of [
      'classes-filters-trainer-all',
      'classes-filters-trainer-Sandro K.',
      'classes-filters-location-all',
    ]) {
      const chip = flatStyle(view.getByTestId(id)).backgroundColor;
      expect(chip).toBeTruthy();
      expect(chip).not.toBe(panel);
    }
  });

  // The nested row is gone, so the two footer buttons lay out against the
  // panel's width instead of collapsing to their own padding.
  it('renders both footer buttons at full label width', async () => {
    mockClasses.instances = [card({ hour: 18, id: 'a', category: 'Spin' })];
    const view = renderScreen(screen());
    await settle();

    fireEvent.press(view.getByTestId('classes-filter-button'));
    for (const id of ['classes-filters-clear', 'classes-filters-apply']) {
      const style = flatStyle(await view.findByTestId(id));
      expect(style.flexGrow).toBe(1);
      expect(style.flexBasis).toBe(0);
    }
    // And the row they sit in is `Sheet`'s own, not a nested content-width one.
    expect(flatStyle(view.getByTestId('classes-filters-footer')).flexDirection).toBe('row');
  });
});

describe('the week strip', () => {
  // ==========================================================================
  // THE CONTROL THAT COULD NOT BE SEEN.
  //
  // Seven 50pt cells, six 6pt gaps, two 44pt chevrons and 40pt of edge padding
  // is 500pt of content in a 402pt viewport. Saturday clipped mid-cell, Sunday
  // was off-screen — and so was the NEXT-WEEK chevron, with nothing on screen
  // to suggest it existed. A rail is the right home for seven interchangeable
  // days and the wrong home for the two controls that change which week those
  // days belong to.
  //
  // Geometry is not expressible here — a test renderer runs no layout pass, so
  // nothing below measures a point frame. What IS expressible is the structural
  // claim the geometry followed from: the chevrons are not inside the scroller.
  // ==========================================================================
  it('keeps both week chevrons outside the scrolling rail', async () => {
    const view = renderScreen(screen());
    await settle();

    const rail = within(view.getByTestId('classes-week-rail'));
    expect(rail.queryByTestId('classes-prev-week')).toBeNull();
    expect(rail.queryByTestId('classes-next-week')).toBeNull();

    // Still on the screen, and still working — the point of the move.
    expect(view.getByTestId('classes-prev-week')).toBeTruthy();
    expect(view.getByTestId('classes-next-week')).toBeTruthy();
    // And the seven days DID stay in the rail.
    expect(rail.getByTestId('classes-day-2026-08-03')).toBeTruthy();
  });

  it('scrolls the selected day into view, which it never used to do', async () => {
    const scrollTo = jest.spyOn(ScrollView.prototype, 'scrollTo').mockImplementation(() => {
      /* no native scroller under test */
    });
    try {
      const view = renderScreen(screen());
      await settle();

      act(() => {
        const onLayout = view.getByTestId('classes-week-rail').props.onLayout as (event: {
          nativeEvent: { layout: { width: number } };
        }) => void;
        onLayout({ nativeEvent: { layout: { width: 280 } } });
      });

      // Monday is index 0 and `railScrollOffset` clamps that to 0 — so drive
      // the selection to a day that genuinely needs the rail to move.
      scrollTo.mockClear();
      fireEvent.press(view.getByTestId('classes-day-2026-08-08'));

      expect(scrollTo).toHaveBeenCalled();
      const [call] = scrollTo.mock.calls.at(-1) as [{ x: number; animated: boolean }];
      expect(call.x).toBeGreaterThan(0);
      expect(call.animated).toBe(false);
    } finally {
      scrollTo.mockRestore();
    }
  });
});
