// Class detail — every branch of plan §6, plus the four states the class
// itself can be in (scheduled / canceled / completed / gone).
//
// The `auth-soft` test is the one that carries the stage's demo: a signed-out
// visitor READS the class and meets the wall at the CTA, which returns them
// here by `next=`. A redirect on mount would be the deleted app's `/login`
// bounce, and it is asserted absent.
//
// Headers are asserted as an ORDERED LIST (§6 item 7, as amended) — the app
// bar's title plus whatever sections are on screen.
import { act, fireEvent, waitFor, within } from '@testing-library/react-native';
import { Dimensions, Image } from 'react-native';
import { SCREEN_GUTTER, ToastProvider, capsuleMetricsFor } from '@fit/ui-mobile';
import type { ReactElement } from 'react';

import ClassDetailScreen from './[id]';
import { ApiError } from '../../../lib/http/api-error';
import { renderScreen } from '../../../test-support/render-screen';
import { flatStyle } from '../../../test-support/style';

// ── The router, and the route param ────────────────────────────────────────
const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
const mockParams: { id?: string } = { id: 'cls_1' };
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
  useLocalSearchParams: () => mockParams,
}));

// ── The session ────────────────────────────────────────────────────────────
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

// ── The read ───────────────────────────────────────────────────────────────
const mockDetail: { instance: Record<string, unknown> | null } = { instance: null };
const mockDetailErrorRef = { current: null as Error | null };
const mockPausedRef = { current: false };
jest.mock('../../../hooks/queries/useClasses', () => ({
  classQueryOptions: (gymId: string | null, classId: string | null | undefined) => ({
    queryKey: ['classes', gymId ?? '', 'detail', classId ?? ''],
    queryFn: () =>
      mockDetailErrorRef.current === null
        ? Promise.resolve(mockDetail)
        : Promise.reject(mockDetailErrorRef.current),
    enabled: gymId !== null && Boolean(classId) && !mockPausedRef.current,
  }),
}));

// ── The coach behind the class, for the sheet ──────────────────────────────
// TWO further requests (`GET /trainers/:id` and its reviews), fired only when
// the row is pressed — so the trainer has its own error ref and the class
// detail's must not decide what the sheet shows. The sheet draws the WHOLE
// profile now, reviews included; `components/classes/trainer-sheet.test.tsx`
// owns every branch of it, and this file only checks that the class detail
// opens it, closes it, and never has two sheets up at once.
const mockTrainer: { trainer: Record<string, unknown> | null } = { trainer: null };
const mockTrainerErrorRef = { current: null as Error | null };
const mockReviews = {
  reviews: [] as unknown[],
  avgRating: 0,
  total: 0,
  page: 1,
  limit: 10,
};
jest.mock('../../../hooks/queries/useTrainers', () => ({
  trainerQueryOptions: (gymId: string | null, trainerId: string | null | undefined) => ({
    queryKey: ['trainers', gymId ?? '', 'detail', trainerId ?? ''],
    queryFn: () =>
      mockTrainerErrorRef.current === null
        ? Promise.resolve(mockTrainer)
        : Promise.reject(mockTrainerErrorRef.current),
    enabled: gymId !== null && Boolean(trainerId),
  }),
  trainerReviewsQueryOptions: (gymId: string | null, trainerId: string | null | undefined) => ({
    queryKey: ['trainers', gymId ?? '', 'detail', trainerId ?? '', 'reviews', null],
    queryFn: () => Promise.resolve(mockReviews),
    enabled: gymId !== null && Boolean(trainerId),
  }),
}));

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

// ── The write ──────────────────────────────────────────────────────────────
const mockBook = jest.fn();
const mockCancel = jest.fn();
jest.mock('../../../hooks/mutations/useBookingMutations', () => ({
  useBookClass: () => ({ mutate: mockBook }),
  useCancelBooking: () => ({ mutate: mockCancel }),
}));

// ── The radio ──────────────────────────────────────────────────────────────
let mockOnline = true;
jest.mock('../../../components/auth/use-online', () => ({ useIsOnline: () => mockOnline }));

/** A scheduled class, on a fixed local Thursday evening. */
function instance(over: Record<string, unknown> = {}) {
  const startsAt = new Date(2026, 7, 6, 18, 0);
  return {
    id: 'cls_1',
    title: 'Spin Express',
    startsAt: startsAt.toISOString(),
    endsAt: new Date(startsAt.getTime() + 45 * 60_000).toISOString(),
    trainerName: 'Sandro K.',
    trainerId: 'trn_1',
    trainerAvatarUrl: null,
    locationName: 'Main Floor',
    capacity: 24,
    bookedCount: 20,
    category: 'Spin',
    color: '#8F8F8B',
    imageUrl: null,
    description: 'Interval cycling to the beat.',
    durationMinutes: 45,
    room: 'Bike zone',
    status: 'SCHEDULED',
    ...over,
  };
}

/** The same coach, as `GET /trainers/:id` answers for him. */
function trainer(over: Record<string, unknown> = {}) {
  return {
    id: 'trn_1',
    name: 'Sandro K.',
    headline: 'Head coach',
    bio: 'Ten years on the floor.',
    avatarUrl: null,
    specialties: ['Spin'],
    locationNames: ['Main Floor'],
    schedule: [],
    ...over,
  };
}

function screen(): ReactElement {
  return (
    <ToastProvider>
      <ClassDetailScreen />
    </ToastProvider>
  );
}

/** The text of every `accessibilityRole="header"`, in tree order. */
function headers(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => (node as { props?: { children?: unknown } }).props?.children);
}

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockBack.mockClear();
  mockBook.mockClear();
  mockCancel.mockClear();
  mockCanGoBack = true;
  mockParams.id = 'cls_1';
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
  mockDetail.instance = instance();
  mockDetailErrorRef.current = null;
  mockPausedRef.current = false;
  mockTrainer.trainer = trainer();
  mockTrainerErrorRef.current = null;
  mockBookings = { bookings: [] };
  mockBookingsState = { isPending: false, isError: false, fetchStatus: 'idle' };
  mockOnline = true;
});

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

describe('the ready screen', () => {
  it('renders the hero, the meter, the facts, the description and the coach', async () => {
    const view = renderScreen(screen());
    await settle();

    expect(await view.findByTestId('class-hero')).toBeTruthy();
    expect(view.getByTestId('class-occupancy')).toBeTruthy();
    expect(view.getByTestId('class-facts')).toBeTruthy();
    expect(view.getByTestId('class-trainer')).toBeTruthy();
    expect(view.getByText('Interval cycling to the beat.')).toBeTruthy();

    // THREE facts, all off `classInstanceDetailSchema` — and no fourth naming
    // the coach, because `class-trainer` above it is the same fact with a face
    // on it. One row of three, so the grid has no empty corner.
    expect(view.queryByTestId('class-fact-trainer')).toBeNull();
    expect(view.getByTestId('class-fact-location')).toBeTruthy();
    expect(view.getByTestId('class-fact-duration')).toBeTruthy();
    expect(view.getByTestId('class-fact-room')).toBeTruthy();
    expect(view.queryByTestId('class-facts-spacer')).toBeNull();
  });

  it('puts the coach above the facts, not below the description', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    // The person the member is deciding about comes before the occurrence's
    // remaining facts, and both come before the blurb.
    const order = ['class-occupancy-panel', 'class-trainer', 'class-facts', 'class-about'];
    const seen = order.map((id) => JSON.stringify(view.toJSON()).indexOf(id));
    expect(seen).toEqual([...seen].sort((a, b) => a - b));
    expect(seen.every((at) => at >= 0)).toBe(true);
  });

  // ------------------------------------------------------------------------
  // THE PHOTO HERO. `classInstanceDetailSchema` extends the card schema, so
  // the detail inherits `imageUrl` — the parity audit deferred this for want
  // of data that was there all along.
  // ------------------------------------------------------------------------
  it('draws the cover behind the hero when the class has one', async () => {
    const hidden = { includeHiddenElements: true } as const;
    mockDetail.instance = instance({ imageUrl: 'https://images.example.com/spin.jpg' });
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    expect(view.getByTestId('class-hero-cover-image', hidden).props.source).toEqual({
      uri: 'https://images.example.com/spin.jpg',
    });
    expect(view.getByTestId('class-hero-cover-scrim', hidden)).toBeTruthy();
  });

  it('renders the hero exactly as it is drawn today when there is no photo', async () => {
    const hidden = { includeHiddenElements: true } as const;
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    expect(view.queryByTestId('class-hero-cover-image', hidden)).toBeNull();
    expect(view.queryByTestId('class-hero-cover-scrim', hidden)).toBeNull();
  });

  it('names its headers in order — the class, then "What to expect"', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');
    await waitFor(() => {
      // Two, not three: the hero's own title IS a `Heading`, but it sits
      // inside the card's single accessibility node, so a screen reader never
      // lands on it — which is the behaviour the card documents and the reason
      // the app bar carries the class name too.
      expect(headers(view.getAllByRole('header'))).toEqual(['Spin Express', 'What to expect']);
    }, WAIT);
  });

  it('spells the seat count from the SAME arithmetic the meter draws', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');
    // 24 − 20 = 4, through `spotsLeftFor` and the ICU plural.
    expect(view.getByTestId('class-spots')).toHaveTextContent('4 spots left');
    expect(view.getByTestId('class-booking-bar')).toBeTruthy();
  });

  it('says "Full" rather than "0 spots left" at capacity', async () => {
    mockDetail.instance = instance({ bookedCount: 24 });
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');
    expect(view.getByTestId('class-spots')).toHaveTextContent('Full');
    expect(view.getByText('Join waitlist')).toBeTruthy();
  });

  it('renders in Georgian with no raw keys left behind', async () => {
    const view = renderScreen(screen(), { locale: 'ka' });
    await settle();
    await view.findByTestId('class-hero');
    expect(view.queryByText('What to expect')).toBeNull();
    expect(view.getByText('რას უნდა ელოდოთ')).toBeTruthy();
    expect(JSON.stringify(view.toJSON())).not.toMatch(/classes\.detail\./);
  });
});

describe('the four states a class can be in', () => {
  it('draws a banner and hides the CTA on a canceled class', async () => {
    mockDetail.instance = instance({ status: 'CANCELED' });
    const view = renderScreen(screen());
    await settle();
    expect(await view.findByTestId('class-detail-status')).toBeTruthy();
    expect(view.getByText('This class has been canceled.')).toBeTruthy();
    // Nothing to book, so no bar — not a disabled button that looks pressable.
    expect(view.queryByTestId('class-booking-bar')).toBeNull();
  });

  it('does the same for one that has already happened', async () => {
    mockDetail.instance = instance({ status: 'COMPLETED' });
    const view = renderScreen(screen());
    await settle();
    expect(await view.findByText('This class has already taken place.')).toBeTruthy();
    expect(view.queryByTestId('class-booking-bar')).toBeNull();
  });

  it('treats a 404 as its OWN state, with a route back to the schedule', async () => {
    mockDetailErrorRef.current = new ApiError({ status: 404, code: 'NOT_FOUND' });
    const view = renderScreen(screen());
    await waitFor(() => {
      expect(view.getByTestId('class-detail-not-found')).toBeTruthy();
    }, WAIT);
    expect(view.getByText('Class not found')).toBeTruthy();
    // NOT the generic error box — a shared link outliving its class is the
    // commonest failure here and deserves its own words.
    expect(view.queryByTestId('class-detail-error')).toBeNull();

    fireEvent.press(view.getByTestId('class-detail-back-to-classes'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('falls back to /classes when there is nothing to pop (a cold deep link)', async () => {
    mockCanGoBack = false;
    const view = renderScreen(screen());
    await settle();
    fireEvent.press(view.getByTestId('class-back'));
    expect(mockReplace).toHaveBeenCalledWith('/classes');
  });
});

describe('the five §6 branches', () => {
  it('loads as section-shaped skeletons', async () => {
    mockGymQuery = { data: undefined, isPending: true, isError: false };
    mockSession.gymId = null;
    const view = renderScreen(screen());
    expect(view.getByTestId('class-detail-loading')).toBeTruthy();
    await settle();
  });

  it('shows an error box whose retry actually reloads the class', async () => {
    mockDetailErrorRef.current = new ApiError({ status: 500, code: 'INTERNAL' });
    const view = renderScreen(screen());
    await waitFor(() => {
      expect(view.getByTestId('class-detail-error')).toBeTruthy();
    }, WAIT);

    mockDetailErrorRef.current = null;
    fireEvent.press(view.getByTestId('class-detail-retry'));
    await waitFor(() => {
      expect(view.queryByTestId('class-detail-error')).toBeNull();
    }, WAIT);
    expect(view.getByTestId('class-hero')).toBeTruthy();
  });

  it('says so when the radio is dead rather than skeletoning forever', async () => {
    mockOnline = false;
    mockPausedRef.current = true;
    const view = renderScreen(screen());
    await settle();
    expect(view.getByTestId('class-detail-offline')).toBeTruthy();
    expect(view.queryByTestId('class-detail-loading')).toBeNull();
  });
});

describe('the auth-soft boundary', () => {
  beforeEach(() => {
    mockSession = { status: 'signed-out', userId: null, gymId: null, role: null, expiresAt: null };
  });

  it('renders the whole class signed out, with no redirect on mount', async () => {
    const view = renderScreen(screen());
    await settle();
    expect(await view.findByTestId('class-hero')).toBeTruthy();
    // The coach included — the row reads signed out, like the rest of the page.
    expect(view.getByTestId('class-trainer')).toBeTruthy();
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('offers "Sign in to book" and returns to THIS class', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    expect(view.getByText('Sign in to book')).toBeTruthy();
    fireEvent.press(view.getByTestId('class-book'));
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fclasses%2Fcls_1');
    // And no confirm sheet behind the prompt.
    expect(view.queryByTestId('class-booking-confirm')).toBeNull();
    expect(mockBook).not.toHaveBeenCalled();
  });
});

describe('booking', () => {
  it('confirms through a sheet, and sends an Idempotency-Key', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    fireEvent.press(view.getByTestId('class-book'));
    const sheet = view.getByTestId('class-booking-confirm');
    expect(sheet).toBeTruthy();
    // The recap names what is being confirmed — on a list screen the member
    // often cannot remember what they tapped.
    // Once in the hero behind it, once in the sheet's recap.
    expect(
      view.getAllByText('Spin Express', { includeHiddenElements: true }).length,
    ).toBeGreaterThan(1);

    fireEvent.press(view.getByTestId('class-booking-confirm-confirm'));
    expect(mockBook).toHaveBeenCalledTimes(1);
    const input = (mockBook.mock.calls[0] as unknown[])[0] as {
      classId: string;
      idempotencyKey?: string;
    };
    expect(input.classId).toBe('cls_1');
    // Per logical ATTEMPT, so a retried POST cannot take a second seat or
    // spend a second class credit.
    expect(typeof input.idempotencyKey).toBe('string');
    expect((input.idempotencyKey ?? '').length).toBeLessThanOrEqual(200);
  });

  it('offers a destructive cancel once the member holds a seat', async () => {
    mockBookings = {
      bookings: [
        {
          bookingId: 'b1',
          status: 'BOOKED',
          waitlistPosition: null,
          bookedAt: new Date(2026, 7, 1).toISOString(),
          classInstance: instance(),
        },
      ],
    };
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    expect(view.getByText('You’re booked')).toBeTruthy();
    fireEvent.press(view.getByTestId('class-book'));
    fireEvent.press(view.getByTestId('class-booking-confirm-confirm'));
    expect(mockCancel).toHaveBeenCalledWith({ classId: 'cls_1' }, expect.anything());
    expect(mockBook).not.toHaveBeenCalled();
  });

  it('REFUSES to draw the sticky bar when `/me/bookings` failed', async () => {
    // The bar's LABEL is the join's answer: with the member's own seats
    // missing, `mine` falls back to `NO_BOOKING` and the bar says **Book** for
    // a class they are already on — answered by `409 ALREADY_BOOKED`. The
    // error box with a working retry is the only honest branch.
    mockBookings = undefined;
    mockBookingsState = { isPending: false, isError: true, fetchStatus: 'idle' };
    const view = renderScreen(screen());
    await settle();

    await waitFor(() => {
      expect(view.getByTestId('class-detail-error')).toBeTruthy();
    }, WAIT);
    expect(view.queryByTestId('class-book')).toBeNull();
    expect(view.queryByTestId('class-hero')).toBeNull();
  });

  it('does NOT skeleton on the disabled `/me/bookings` — signed out', async () => {
    // Signed out the query is disabled, so `isPending` never clears. Reading
    // that as "loading" would hide the whole `auth-soft` page from the visitor
    // it exists for.
    mockSession = { status: 'signed-out', userId: null, gymId: null, role: null, expiresAt: null };
    mockBookings = undefined;
    mockBookingsState = { isPending: true, isError: false, fetchStatus: 'idle' };
    const view = renderScreen(screen());
    await settle();

    await view.findByTestId('class-hero');
    expect(view.queryByTestId('class-detail-loading')).toBeNull();
    expect(view.queryByTestId('class-detail-error')).toBeNull();
  });

  it('shows the waitlist position it is given', async () => {
    mockBookings = {
      bookings: [
        {
          bookingId: 'b1',
          status: 'WAITLIST',
          waitlistPosition: 2,
          bookedAt: new Date(2026, 7, 1).toISOString(),
          classInstance: instance(),
        },
      ],
    };
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');
    expect(view.getByText('Position #2')).toBeTruthy();
    expect(view.getByText('Leave waitlist')).toBeTruthy();
  });

  it('states a refusal in the member’s own language, from `member.actions.err*`', async () => {
    mockBook.mockImplementation(
      (_input: unknown, handlers: { onError: (error: unknown) => void }) => {
        handlers.onError(new ApiError({ status: 409, code: 'ALREADY_BOOKED' }));
      },
    );
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    fireEvent.press(view.getByTestId('class-book'));
    await act(async () => {
      fireEvent.press(view.getByTestId('class-booking-confirm-confirm'));
      await Promise.resolve();
    });

    expect(view.getByTestId('class-booking-error')).toBeTruthy();
    expect(view.getByText("You're already booked")).toBeTruthy();
  });

  it('treats a frozen membership as a state with a way out, not an error', async () => {
    mockBook.mockImplementation(
      (_input: unknown, handlers: { onError: (error: unknown) => void }) => {
        // 403 `SUBSCRIPTION_FROZEN` — `bookings.service.ts:456`. (The brief said
        // 409; it is the CODE that is branched on either way.)
        handlers.onError(new ApiError({ status: 403, code: 'SUBSCRIPTION_FROZEN' }));
      },
    );
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    fireEvent.press(view.getByTestId('class-book'));
    await act(async () => {
      fireEvent.press(view.getByTestId('class-booking-confirm-confirm'));
      await Promise.resolve();
    });

    expect(view.getByTestId('class-booking-error-frozen')).toBeTruthy();
    expect(view.queryByText('Something went wrong')).toBeNull();
    fireEvent.press(view.getByTestId('class-booking-error-manage-plan'));
    expect(mockPush).toHaveBeenCalledWith('/membership');
  });
});

describe('a route param that has not resolved yet', () => {
  it('renders nothing that looks like a failure', async () => {
    // A deep link resolves its param asynchronously. `classQueryOptions` treats
    // the gap as a DISABLED query, not as a request for `/class-instances/`.
    delete mockParams.id;
    const view = renderScreen(screen());
    await settle();
    expect(view.queryByTestId('class-detail-error')).toBeNull();
    expect(view.queryByTestId('class-detail-not-found')).toBeNull();
    expect(view.queryByTestId('class-detail-loading')).toBeNull();
  });
});

describe('the coach', () => {
  // ==========================================================================
  // THE ROW HAS A FACE, AND IT OPENS.
  //
  // `classInstanceDetailSchema` carries `trainerId` and `trainerAvatarUrl`, so
  // the row that was inert ("a denormalised string and nothing to route to")
  // now draws the portrait and opens the coach's sheet. A null id is still a
  // real state — a template with a name typed in and no staff record behind it
  // — and that row stays inert rather than pressable-and-dead.
  // ==========================================================================
  it('draws the coach’s photo when the class carries one', async () => {
    mockDetail.instance = instance({ trainerAvatarUrl: 'https://images.example.com/sandro.jpg' });
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    const row = view.getByTestId('class-trainer');
    expect(within(row).UNSAFE_getByType(Image).props.source).toEqual({
      uri: 'https://images.example.com/sandro.jpg',
    });
  });

  it('falls back to the monogram when the coach has no photo', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    const row = view.getByTestId('class-trainer');
    expect(within(row).UNSAFE_queryByType(Image)).toBeNull();
    // `trainerInitials` — locale-specific, which is why `Avatar` cannot derive it.
    // Hidden from the reader — the name is the very next node. See `Avatar`.
    expect(within(row).getByText('SK', { includeHiddenElements: true })).toBeTruthy();
  });

  it('is one accessible stop that names what it is for', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    const row = view.getByTestId('class-trainer');
    expect(row.props.accessibilityRole).toBe('button');
    expect(row.props.accessibilityLabel).toBe('Trainer: Sandro K.');
    expect(row.props.accessibilityHint).toBe('Shows this trainer’s details');
  });

  it('stays inert when the class has a coach’s NAME but no id', async () => {
    mockDetail.instance = instance({ trainerId: null });
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    const row = view.getByTestId('class-trainer');
    expect(row.props.accessibilityRole).toBeUndefined();
    // Still the coach's row, still their name — just nothing to open.
    expect(within(row).getByText('Sandro K.')).toBeTruthy();
    fireEvent.press(row);
    expect(view.queryByTestId('class-trainer-sheet')).toBeNull();
  });

  it('opens a sheet with the headline, the specialties and the bio', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    fireEvent.press(view.getByTestId('class-trainer'));
    await waitFor(() => {
      expect(view.getByTestId('class-trainer-sheet-bio')).toBeTruthy();
    }, WAIT);

    expect(view.getByText('Head coach')).toBeTruthy();
    expect(view.getByText('Ten years on the floor.')).toBeTruthy();
    expect(view.getByText('Spin')).toBeTruthy();
    // The class's own name is the title, so it is on screen twice — once in the
    // row behind the scrim, once in the sheet's header.
    expect(view.getAllByText('Sandro K.', { includeHiddenElements: true }).length).toBeGreaterThan(
      1,
    );
  });

  it('keeps its OWN error phase — a dead `/trainers/:id` costs the sheet, not the class', async () => {
    mockTrainerErrorRef.current = new ApiError({ status: 500, code: 'INTERNAL' });
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    fireEvent.press(view.getByTestId('class-trainer'));
    await waitFor(() => {
      expect(view.getByTestId('class-trainer-sheet-error')).toBeTruthy();
    }, WAIT);
    // The class is still there behind it, and the screen never became an error.
    expect(view.queryByTestId('class-detail-error')).toBeNull();
    expect(view.getByTestId('class-hero')).toBeTruthy();
  });

  // ==========================================================================
  // THE SHEET *IS* THE FULL PROFILE (2026-09-09). `/trainers/:id` IS DELETED.
  //
  // There used to be a "View full profile" button here that pushed the route.
  // The sheet now draws everything that screen did — the facts on cards, the
  // upcoming schedule and the reviews — so there is nowhere left to send the
  // member, and the assertion is that nothing navigates.
  // ==========================================================================
  it('shows the whole profile in the sheet and navigates nowhere', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-trainer');

    fireEvent.press(view.getByTestId('class-trainer'));
    await waitFor(() => {
      expect(view.getByTestId('class-trainer-sheet-specialties')).toBeTruthy();
    }, WAIT);

    expect(view.getByTestId('class-trainer-sheet-locations')).toBeTruthy();
    expect(view.getByTestId('trainer-schedule')).toBeTruthy();
    expect(view.getByTestId('trainer-reviews')).toBeTruthy();
    expect(view.queryByTestId('class-trainer-sheet-profile')).toBeNull();
    expect(mockPush).not.toHaveBeenCalled();
    // …and it is still open: nothing took the member off the class.
    expect(view.getByTestId('class-trainer-sheet')).toBeTruthy();
  });

  // ==========================================================================
  // ONE SHEET PER SCREEN. Two `Modal`s whose `visible` overlaps for one frame
  // flash black on iOS — `Sheet`'s own header — and this screen now has two.
  // ==========================================================================
  it('never has the booking sheet and the coach’s sheet open at once', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    fireEvent.press(view.getByTestId('class-trainer'));
    await waitFor(() => {
      expect(view.getByTestId('class-trainer-sheet')).toBeTruthy();
    }, WAIT);
    expect(view.queryByTestId('class-booking-confirm')).toBeNull();

    fireEvent.press(view.getByTestId('class-book'));
    expect(view.getByTestId('class-booking-confirm')).toBeTruthy();
    await waitFor(() => {
      expect(view.queryByTestId('class-trainer-sheet')).toBeNull();
    }, WAIT);
  });

  it('renders the sheet in Georgian with no raw keys left behind', async () => {
    const view = renderScreen(screen(), { locale: 'ka' });
    await settle();
    await view.findByTestId('class-hero');

    fireEvent.press(view.getByTestId('class-trainer'));
    await waitFor(() => {
      expect(view.getByTestId('class-trainer-sheet-specialties')).toBeTruthy();
    }, WAIT);

    // One key from each of the two families the sheet draws from (D10):
    // `member.trainers.detail.specialties` and `trainers.detail.reviews.title`.
    expect(view.getByText('სპეციალიზაციები')).toBeTruthy();
    expect(view.getByText('შეფასებები')).toBeTruthy();
    const tree = JSON.stringify(view.toJSON());
    expect(tree).not.toMatch(/classes\.detail\./);
    expect(tree).not.toMatch(/trainers\.detail\./);
  });
});

describe('the booking bar', () => {
  // ==========================================================================
  // THE BAR IS THE NAV CAPSULE, ONE ROW UP.
  //
  // `Screen` pins the footer 12pt above the floating tab bar, so the two are
  // read as a pair — and until this stage they were drawn as different objects:
  // the capsule is 72 tall (60 compact), a full pill, inset by the screen
  // gutter; the bar was content-height, radius 26 and edge-to-edge, because
  // this screen turns `Screen`'s own gutter off.
  //
  // The renderer runs no layout pass, so the frames are not observable. What
  // IS observable is that every number comes from `capsuleMetricsFor` rather
  // than from a literal — which is the property that survives a change to the
  // capsule.
  // ==========================================================================
  function capsule(): ReturnType<typeof capsuleMetricsFor> {
    return capsuleMetricsFor(Dimensions.get('window').width);
  }

  it('takes the capsule’s height, pill and gutters — never its own numbers', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    const bar = flatStyle(view.getByTestId('class-booking-bar'));
    const metrics = capsule();
    expect(bar.height).toBe(metrics.height);
    // `Surface`'s `side` clamp: `full` resolves to `floor(height / 2)`, which
    // is the capsule's own `borderRadius`.
    expect(bar.borderRadius).toBe(Math.floor(metrics.height / 2));
    expect(bar.padding).toBe(metrics.padding);
    // The capsule pads itself by `SCREEN_GUTTER`; the footer wrapper cannot,
    // because this screen renders `Screen` with `gutter={false}`.
    expect(bar.marginHorizontal).toBe(SCREEN_GUTTER);
  });

  it('shrinks with the capsule on a small device', async () => {
    // The compact branch — 52 + 2 × 4 rather than 56 + 2 × 8 — fires below
    // `COMPACT_WIDTH`. It is the height the seat count no longer has to fit in.
    const window = { width: 320, height: 568, scale: 2, fontScale: 2 };
    const spy = jest.spyOn(Dimensions, 'get').mockReturnValue(window);
    try {
      const view = renderScreen(screen());
      await settle();
      await view.findByTestId('class-hero');

      const bar = flatStyle(view.getByTestId('class-booking-bar'));
      expect(capsuleMetricsFor(320).compact).toBe(true);
      expect(bar.height).toBe(capsuleMetricsFor(320).height);
      expect(bar.borderRadius).toBe(capsuleMetricsFor(320).height / 2);
    } finally {
      spy.mockRestore();
    }
  });

  it('holds the commitment and nothing else — the seat count stays in the panel', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    // 56pt of content inside a 72pt pill is one `lg` button, in either locale.
    expect(view.queryByTestId('class-booking-capacity')).toBeNull();
    expect(view.getByTestId('class-book')).toBeTruthy();
    // Not lost — `class-occupancy-panel` is directly above it, and always was.
    expect(view.getByTestId('class-spots')).toHaveTextContent('4 spots left');
    // And with no seat of their own, the member has no standing line at all.
    expect(view.queryByTestId('class-booking-line')).toBeNull();
  });

  it('says "Book", not "Book this class" — the hero above it names the class', async () => {
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');
    expect(view.getByTestId('class-book')).toHaveTextContent('Book');
    expect(view.queryByText('Book this class')).toBeNull();
  });

  it('moves the member’s own standing into the occupancy panel', async () => {
    mockBookings = {
      bookings: [
        {
          bookingId: 'b1',
          status: 'WAITLIST',
          waitlistPosition: 2,
          bookedAt: new Date(2026, 7, 1).toISOString(),
          classInstance: instance(),
        },
      ],
    };
    const view = renderScreen(screen());
    await settle();
    await view.findByTestId('class-hero');

    expect(view.getByTestId('class-booking-line')).toHaveTextContent('Position #2');
    // Inside the panel, not the bar — the bar has room for the button alone.
    expect(
      view.getByTestId('class-occupancy-panel').findByProps({ testID: 'class-booking-line' }),
    ).toBeTruthy();
  });
});
