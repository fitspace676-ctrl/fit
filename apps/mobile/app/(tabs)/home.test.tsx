// Home — six sections, six branch sets, and one test with teeth.
//
// ===========================================================================
// THE TEST THIS FILE EXISTS FOR IS `renders the membership card FROM THE
// PAYLOAD`. Everything else is §6 housekeeping.
//
// The deleted app shipped `ACTIVE`, `22 / 30` and a 73% ring baked into home's
// JSX, and §1 of the rebuild plan names it as one of the three reasons the app
// was deleted. Two independent guards below make that specific regression
// impossible to reintroduce quietly:
//
//   1. **Behavioural.** Two different subscription fixtures are rendered and
//      the card's numbers are asserted to follow them. A hardcoded card passes
//      the first and fails the second, which is the only way a literal can be
//      caught by a test that does not know what a literal is.
//   2. **Textual.** The screen's source and the membership adapter's source are
//      read from disk, stripped of comments, and searched for the four
//      literals. Comments are stripped because both files DISCUSS `ACTIVE` and
//      `22 / 30` at length — the discussion is the point, and a guard that
//      forbade talking about the bug would be deleted within a month.
//
// ---------------------------------------------------------------------------
// HOW THE DATA IS FAKED: THE TRANSPORT, NOT THE HOOKS.
//
// Every `lib/api/*` module home reaches is mocked and everything above it is
// real — the real `useQuery`, the real `QueryClient`, the real
// `pending → error` machine, the real `onlineManager` pause. Mocking the hooks
// would let a test assert a state the library cannot produce, which is how a
// screen ends up correct against a fiction; mocking `useQuery` itself would be
// worse again. In particular the OFFLINE assertions below drive a genuine
// paused query through `onlineManager.setOnline(false)`.
//
// `renderApp`, not `renderScreen`: the sections below reach for providers a
// bare `renderScreen` does not mount.
//
// ---------------------------------------------------------------------------
// Jest's default `testTimeout` is 5000ms — the same budget as a generous
// `waitFor` — so on a loaded machine a slow box reports as a broken assertion
// at the `waitFor` line. Plan §7 says set both explicitly; this file does.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import type {
  ClassInstanceCard,
  GetMeSubscriptionResponse,
  MeSubscription,
  MemberBookingHistoryEntry,
  TrainerCard,
} from '@fit/types';

import HomeScreen from './home';
import { renderApp } from '../../test-support/render';

jest.setTimeout(30_000);

/** A generous wait that is still well inside the timeout above. */
const WAIT = { timeout: 10_000 };

/** Inside a row that collapses to one accessibility node, or behind one. */
const HIDDEN = { includeHiddenElements: true } as const;

const DAY = 86_400_000;

// ── The router ─────────────────────────────────────────────────────────────

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

// ── The tenant and the session ─────────────────────────────────────────────

jest.mock('../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

jest.mock('../../hooks/useSession', () => ({
  useSession: () => ({
    status: 'signed-in',
    userId: 'user_1',
    gymId: 'gym_1',
    role: 'MEMBER',
    expiresAt: null,
  }),
  useIsSignedIn: () => true,
}));

// The slug the membership block's cover is looked up by. The screen resolves it
// the same way login and settings do — build config, deep link, last login.
jest.mock('../../lib/auth/session', () => ({ resolveGymSlug: () => 'downtown' }));

// ── The transport ──────────────────────────────────────────────────────────
//
// A `jest.mock` factory is hoisted above the import block, so it may not close
// over an out-of-scope binding unless the name is `mock`-prefixed. Every fake
// below is declared that way for exactly that reason.

const mockGetMyProfile = jest.fn();
const mockGetMySubscription = jest.fn();
jest.mock('../../lib/api/me', () => ({
  getMyProfile: () => mockGetMyProfile() as unknown,
  getMySubscription: () => mockGetMySubscription() as unknown,
  getMyGoals: () => Promise.resolve({ goals: [] }),
}));

const mockListMyBookings = jest.fn();
jest.mock('../../lib/api/bookings', () => ({
  listMyBookings: () => mockListMyBookings() as unknown,
  bookClass: () => Promise.resolve({}),
  cancelBooking: () => Promise.resolve({}),
}));

const mockListMyCreditPacks = jest.fn();
jest.mock('../../lib/api/credit-packs', () => ({
  listMyCreditPacks: () => mockListMyCreditPacks() as unknown,
  listCreditPackCatalogue: () => Promise.resolve({ packs: [] }),
  purchaseCreditPack: () => Promise.resolve({}),
}));

const mockListServices = jest.fn();
const mockListMyServiceSessions = jest.fn();
jest.mock('../../lib/api/service-sessions', () => ({
  listServices: () => mockListServices() as unknown,
  listMyServiceSessions: () => mockListMyServiceSessions() as unknown,
  listServiceSlots: () => Promise.resolve({ slots: [] }),
}));

const mockListTrainers = jest.fn();
const mockGetTrainer = jest.fn();
jest.mock('../../lib/api/trainers', () => ({
  listTrainers: () => mockListTrainers() as unknown,
  getTrainer: () => mockGetTrainer() as unknown,
}));

// Read by the trainer sheet, which Home mounts once for its trainers section.
jest.mock('../../lib/api/reviews', () => ({
  listTrainerReviews: () => Promise.resolve({ reviews: [], total: 0, avgRating: 0 }),
}));

const mockGetGymBySubdomain = jest.fn();
jest.mock('../../lib/api/gyms', () => ({
  getGymBySubdomain: () => mockGetGymBySubdomain() as unknown,
}));

const mockListProducts = jest.fn();
jest.mock('../../lib/api/catalogue', () => ({
  listProducts: () => mockListProducts() as unknown,
  listPackages: () => Promise.resolve({ packages: [] }),
  listLocations: () => Promise.resolve({ locations: [] }),
  getCatalogue: () => Promise.resolve({}),
}));

const mockListBanners = jest.fn();
jest.mock('../../lib/api/banners', () => ({
  listBanners: () => mockListBanners() as unknown,
}));

const mockGetUnreadCount = jest.fn();
jest.mock('../../lib/api/notifications', () => ({
  getUnreadCount: () => mockGetUnreadCount() as unknown,
  listNotifications: () => Promise.resolve({ data: [], total: 0, page: 1, limit: 20, unread: 0 }),
  markNotificationsRead: () => Promise.resolve({}),
  registerPushToken: () => Promise.resolve({}),
  unregisterPushToken: () => Promise.resolve(undefined),
}));

// ── Fixtures ───────────────────────────────────────────────────────────────
//
// Every instant is relative to the wall clock at test time, so the assertions
// are deterministic without faking timers — and faking them is genuinely
// dangerous in this suite (see `jest.config.js` on `setImmediate`).

function subscription(overrides: Partial<MeSubscription> = {}): MeSubscription {
  const now = Date.now();
  return {
    id: 'sub_1',
    status: 'TRIAL',
    planName: 'Starter',
    priceAmount: 5000,
    currency: 'GEL',
    interval: 'MONTH',
    // A ten-day period, four days in ⇒ six left, 40%.
    currentPeriodStart: new Date(now - 4 * DAY).toISOString(),
    currentPeriodEnd: new Date(now + 6 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    frozenAt: null,
    frozenUntil: null,
    freezeDaysPerPeriod: 14,
    freezeDaysUsed: 0,
    freezeDaysRemaining: 14,
    memberSince: new Date(now - 400 * DAY).toISOString(),
    ...overrides,
  };
}

function membership(sub: MeSubscription | null): GetMeSubscriptionResponse {
  return { subscription: sub, invoices: [] };
}

function classInstance(overrides: Partial<ClassInstanceCard> = {}): ClassInstanceCard {
  return {
    id: 'ci_1',
    title: 'Morning Spin',
    startsAt: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    endsAt: new Date(Date.now() + 2 * 3_600_000 + 45 * 60_000).toISOString(),
    trainerName: 'Nino Beridze',
    trainerId: null,
    trainerAvatarUrl: null,
    locationName: 'Main Floor',
    capacity: 12,
    bookedCount: 3,
    category: 'Cardio',
    color: '#E4F26A',
    imageUrl: null,
    ...overrides,
  };
}

function bookingEntry(
  overrides: Partial<MemberBookingHistoryEntry> = {},
): MemberBookingHistoryEntry {
  return {
    bookingId: 'bk_1',
    status: 'BOOKED',
    waitlistPosition: null,
    bookedAt: new Date().toISOString(),
    classInstance: {
      ...classInstance({ id: 'ci_9', title: 'Evening Yoga' }),
      status: 'SCHEDULED',
      description: '',
      room: 'Studio A',
    } as MemberBookingHistoryEntry['classInstance'],
    ...overrides,
  };
}

function trainerCard(overrides: Partial<TrainerCard> = {}): TrainerCard {
  return {
    id: 'tr_1',
    name: 'Ana Gelashvili',
    headline: 'Head coach',
    bio: '',
    avatarUrl: null,
    specialties: ['Yoga'],
    locationNames: [],
    ...overrides,
  };
}

/** The happy path: everything resolves, everything has content. */
function seedAll() {
  mockGetMyProfile.mockResolvedValue({
    profile: { userId: 'user_1', name: 'Nino Kapanadze', email: 'n@example.com', phone: null },
  });
  mockGetMySubscription.mockResolvedValue(membership(subscription()));
  mockListMyBookings.mockResolvedValue({ bookings: [bookingEntry()] });
  mockListMyCreditPacks.mockResolvedValue({
    packs: [
      {
        id: 'cp_1',
        totalCredits: 5,
        remainingCredits: 2,
        expiresAt: null,
        planTitle: 'PT 5',
      },
    ],
  });
  mockListServices.mockResolvedValue({
    services: [
      {
        id: 'sv_1',
        type: 'PERSONAL_TRAINING',
        name: 'PT with Ana',
        description: '',
        priceMinor: 9000,
        currency: 'GEL',
        durationMinutes: 60,
        coverUrl: null,
        schedule: null,
        staff: { id: 'st_1', name: 'Ana G.', photoUrl: null },
      },
    ],
  });
  mockListMyServiceSessions.mockResolvedValue({ sessions: [] });
  // FOUR trainers, because the section shows three: a roster longer than the
  // teaser is what makes `TRAINERS_LIMIT` observable rather than incidental.
  mockListTrainers.mockResolvedValue({
    trainers: [
      trainerCard(),
      trainerCard({ id: 'tr_2', name: 'Beka Ch.', headline: 'Strength' }),
      trainerCard({ id: 'tr_3', name: 'Giorgi T.', headline: 'Mobility' }),
      trainerCard({ id: 'tr_4', name: 'Dato M.', headline: 'Boxing' }),
    ],
  });
  mockGetTrainer.mockResolvedValue({ trainer: { ...trainerCard(), schedule: [] } });
  mockGetGymBySubdomain.mockResolvedValue({
    gymId: 'gym_1',
    name: 'Downtown Strength',
    brand: null,
    timezone: 'Asia/Tbilisi',
    contact: null,
    portal: {
      loginImageUrl: 'https://cdn.test/downtown.jpg',
      logoUrl: null,
      primaryColor: '#E4F26A',
    },
  });
  mockListProducts.mockResolvedValue({
    products: [
      {
        id: 'pr_1',
        name: 'Whey Protein 1kg',
        description: '',
        priceAmount: 8900,
        currency: 'GEL',
        imageUrl: null,
        variants: [],
      },
    ],
  });
  mockGetUnreadCount.mockResolvedValue({ unread: 3 });
  // The seed's three shapes: an in-app link, an absolute URL, and no link.
  mockListBanners.mockResolvedValue({
    banners: [
      {
        id: 'bn_1',
        title: 'Summer membership',
        imageUrl: 'https://cdn.test/summer.jpg',
        linkUrl: '/shop',
      },
      {
        id: 'bn_2',
        title: 'Reformer pilates',
        imageUrl: 'https://cdn.test/pilates.jpg',
        linkUrl: 'https://downtown.fit.ge/classes',
      },
      { id: 'bn_3', title: null, imageUrl: 'https://cdn.test/plain.jpg', linkUrl: null },
    ],
  });
}

/** Everything resolves, and every list is empty. */
function seedEmpty() {
  seedAll();
  mockListMyBookings.mockResolvedValue({ bookings: [] });
  mockListMyCreditPacks.mockResolvedValue({ packs: [] });
  mockListServices.mockResolvedValue({ services: [] });
  mockListTrainers.mockResolvedValue({ trainers: [] });
  mockListProducts.mockResolvedValue({ products: [] });
  mockListBanners.mockResolvedValue({ banners: [] });
}

beforeEach(() => {
  mockPush.mockClear();
  for (const fake of [
    mockGetMyProfile,
    mockGetMySubscription,
    mockListMyBookings,
    mockListMyCreditPacks,
    mockListServices,
    mockListMyServiceSessions,
    mockListTrainers,
    mockGetTrainer,
    mockListProducts,
    mockGetUnreadCount,
    mockGetGymBySubdomain,
    mockListBanners,
  ]) {
    fake.mockReset();
  }
  seedAll();
  onlineManager.setOnline(true);
});

afterEach(() => {
  // Leaking `false` into the next file would pause every query in it.
  onlineManager.setOnline(true);
});

/** The text of each `role="header"`, typed. RNTL types host props as `any`. */
function headerTexts(nodes: readonly unknown[]): string[] {
  return nodes.map((node) => String((node as { props?: { children?: unknown } }).props?.children));
}

// ===========================================================================
// 1. THE MEMBERSHIP CARD IS NOT HARDCODED.
// ===========================================================================

describe('the membership card', () => {
  it('renders the plan, the status and the period FROM THE PAYLOAD', async () => {
    const { findByTestId, getByText, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);

    // The fixture's plan and status, not the deleted app's.
    expect(getByText('Starter')).toBeTruthy();
    expect(getByText(/Trial/)).toBeTruthy();
    // Four days into a ten-day period.
    expect(getByText(/6 of 10 days left/)).toBeTruthy();
    // And emphatically not the literals §1 is about.
    expect(queryByText(/\bActive\b/)).toBeNull();
    expect(queryByText(/22 \/ 30/)).toBeNull();
  });

  it('follows a DIFFERENT payload — which a hardcoded card cannot do', async () => {
    const now = Date.now();
    mockGetMySubscription.mockResolvedValue(
      membership(
        subscription({
          status: 'ACTIVE',
          planName: 'Premium',
          // A twenty-day period, fifteen days in ⇒ five left.
          currentPeriodStart: new Date(now - 15 * DAY).toISOString(),
          currentPeriodEnd: new Date(now + 5 * DAY).toISOString(),
        }),
      ),
    );
    const { findByTestId, getByText } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);

    expect(getByText('Premium')).toBeTruthy();
    expect(getByText(/5 of 20 days left/)).toBeTruthy();
  });

  it('renders a member with NO subscription as a real state, not an error', async () => {
    mockGetMySubscription.mockResolvedValue(membership(null));
    const { findByTestId, getByText } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block-none', {}, WAIT);
    expect(getByText('No active plan')).toBeTruthy();
  });

  it('states a cancelling plan without offering a cancel button', async () => {
    // `cancelAtPeriodEnd` is the field that looks like a toggle's backing
    // store and is not one: no member route writes it (plan §7).
    mockGetMySubscription.mockResolvedValue(membership(subscription({ cancelAtPeriodEnd: true })));
    const { findByTestId, getByText, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    expect(getByText(/won't renew/)).toBeTruthy();
    expect(queryByText('Cancel membership')).toBeNull();
  });

  it('draws NO meter for a subscription with no dated period', async () => {
    mockGetMySubscription.mockResolvedValue(
      membership(subscription({ currentPeriodStart: '', currentPeriodEnd: '' })),
    );
    const { findByTestId, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    // No invented 0% bar, and no "0 of 0 days left".
    expect(queryByText(/days left/)).toBeNull();
  });
});

describe('the source itself', () => {
  /** Everything outside a comment. Both files discuss the literals on purpose. */
  function code(relative: string): string {
    const source = readFileSync(join(__dirname, relative), 'utf8');
    return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  }

  it.each([
    ['home.tsx', './home.tsx'],
    ['membership-card.tsx', '../../components/membership/membership-card.tsx'],
    ['stat-strip.tsx', '../../components/home/stat-strip.tsx'],
  ])('%s contains none of the four literals §1 is about', (_name, relative) => {
    const source = code(relative);
    // A quoted `ACTIVE` — the status the old card asserted for every member.
    expect(source).not.toMatch(/['"`]ACTIVE['"`]/);
    // The period, in any of the spellings the artboard uses.
    expect(source).not.toMatch(/22\s*\/\s*30/);
    expect(source).not.toMatch(/\b73\s*%/);
  });
});

// ===========================================================================
// 2. §6, PER SECTION.
// ===========================================================================

describe('every section owns its own four branches', () => {
  const SECTIONS = [
    'home-membership',
    'home-stat-strip',
    'home-upcoming',
    'home-services',
    'home-trainer',
    'home-shop',
  ] as const;

  it('shows SKELETONS while each section loads — never one page spinner', () => {
    const { getByTestId } = renderApp(<HomeScreen />);
    for (const section of SECTIONS) {
      expect(getByTestId(`${section}-loading`)).toBeTruthy();
    }
  });

  it('gives EVERY section its own error box with a working retry', async () => {
    mockGetMySubscription.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<HomeScreen />);

    await findByTestId('home-membership-error', {}, WAIT);
    // One dead upstream must not blank the page — the other sections landed.
    expect(queryByTestId('home-upcoming-error')).toBeNull();
    await waitFor(() => {
      expect(getByTestId('home-stat-strip')).toBeTruthy();
    }, WAIT);

    // The retry re-reads, rather than sitting on the error.
    mockGetMySubscription.mockResolvedValue(membership(subscription()));
    fireEvent.press(getByTestId('home-membership-retry'));
    await findByTestId('home-membership-block', {}, WAIT);
    expect(mockGetMySubscription).toHaveBeenCalledTimes(2);
  });

  it('renders an OFFLINE branch rather than skeletons forever', async () => {
    onlineManager.setOnline(false);
    const { getByTestId, queryByTestId } = renderApp(<HomeScreen />);
    await waitFor(() => {
      expect(getByTestId('home-offline')).toBeTruthy();
    }, WAIT);
    expect(getByTestId('home-membership-offline')).toBeTruthy();
    expect(queryByTestId('home-membership-loading')).toBeNull();
    expect(mockGetMySubscription).not.toHaveBeenCalled();
  });

  it('renders an EMPTY state per section, each with its own next action', async () => {
    seedEmpty();
    const { findByTestId, getByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-upcoming-empty', {}, WAIT);
    expect(getByTestId('home-trainer-empty')).toBeTruthy();
    expect(getByTestId('home-shop-empty')).toBeTruthy();
  });

  // The one section that is ABSENT rather than empty. Whether a gym sells
  // personal training is the gym's decision, so there is no action to offer and
  // nothing for the member to do about it — see the section's own comment.
  it('drops the SERVICES section entirely for a gym that sells none', async () => {
    seedEmpty();
    const { findByTestId, queryByTestId, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-upcoming-empty', {}, WAIT);
    expect(queryByTestId('home-services')).toBeNull();
    expect(queryByTestId('home-services-empty')).toBeNull();
    expect(queryByText('Services')).toBeNull();
  });

  // …but only once the request has ANSWERED "none". A section that vanished on a
  // failed call would be indistinguishable from a gym with no services.
  it('keeps the services heading through its loading and error branches', async () => {
    mockListServices.mockRejectedValue(new Error('boom'));
    const { findByTestId, getByText } = renderApp(<HomeScreen />);
    await findByTestId('home-services-error', {}, WAIT);
    expect(getByText('Services')).toBeTruthy();
  });

  it('sends a member with NO bookings to the classes tab, not to a class rail', async () => {
    // The one discovery affordance Home keeps. `home-bookable` used to draw six
    // class cards here; the section is gone and this CTA is what replaced it.
    seedEmpty();
    const { findByTestId, getByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-upcoming-empty', {}, WAIT);
    fireEvent.press(getByTestId('home-upcoming-browse'));
    expect(mockPush).toHaveBeenCalledWith('/classes');
  });
});

// ===========================================================================
// 3. THE FIGURES THAT ARE NOT THE MEMBERSHIP CARD.
// ===========================================================================

describe('the counters', () => {
  it('counts the member s own rows, and the live credit balance', async () => {
    const { findByTestId, getByLabelText } = renderApp(<HomeScreen />);
    await findByTestId('home-stats-classes', {}, WAIT);
    // One upcoming booking in the fixture; 2 of 5 credits left. The tile's
    // caption is the bare "PT": the figure beside it already reads "2/5", and
    // "PT left: 2/5 left" is what the old copy made of it.
    expect(getByLabelText('Classes booked: 1')).toBeTruthy();
    expect(getByLabelText('PT: 2/5')).toBeTruthy();
  });

  it('draws NO day-streak tile — the API has no check-in log', async () => {
    const { findByTestId, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-stats-classes', {}, WAIT);
    // `member.home.dayStreak` and `member.home.checkInsMonth` are deliberately
    // unread: the only check-in surface is `admin/check-ins`, which a MEMBER
    // token cannot call. See `components/home/stat-strip.tsx`.
    expect(queryByText('Day streak')).toBeNull();
    expect(queryByText('Check-ins')).toBeNull();
  });
});

describe('the lists', () => {
  // Home no longer browses the catalogue: `GET /class-instances` is not among
  // the requests this screen makes, and no class rail is drawn from it.
  it('offers NO bookable-class rail — discovery is the classes tab s job', async () => {
    const { findByTestId, queryByTestId, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-booking-bk_1', {}, WAIT);
    expect(queryByTestId('home-bookable')).toBeNull();
    expect(queryByTestId('home-class-ci_1')).toBeNull();
    expect(queryByText('Book a class')).toBeNull();
  });

  it('opens the class behind an upcoming booking from the row', async () => {
    const { findByTestId, getByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-booking-bk_1', {}, WAIT);
    fireEvent.press(getByTestId('home-booking-bk_1'));
    expect(mockPush).toHaveBeenCalledWith('/classes/ci_9');
  });

  it('shows the member s upcoming bookings with their status spelled out', async () => {
    mockListMyBookings.mockResolvedValue({
      bookings: [bookingEntry({ status: 'WAITLIST', waitlistPosition: 2 })],
    });
    const { findByTestId, getByLabelText } = renderApp(<HomeScreen />);
    await findByTestId('home-booking-bk_1', {}, WAIT);
    // The pill is inside the row's one accessibility node, so the position has
    // to be in the row's label too.
    expect(getByLabelText(/Waitlist · #2/)).toBeTruthy();
  });

  it('offers the trainer, the services and the shop rail', async () => {
    const { findByTestId, getByText } = renderApp(<HomeScreen />);
    await findByTestId('home-trainer-tr_1', {}, WAIT);
    // Every one of these sits inside a row that is one accessibility node.
    const inside = { includeHiddenElements: true } as const;
    expect(getByText('Ana Gelashvili', inside)).toBeTruthy();
    expect(getByText('PT with Ana', inside)).toBeTruthy();
    expect(getByText('Whey Protein 1kg', inside)).toBeTruthy();
  });
});

// ===========================================================================
// 3b. THE TRAINERS SECTION — THREE COACHES, AND NO "YOUR" ANYWHERE.
// ===========================================================================

describe('the trainers section', () => {
  it('shows THREE of the roster, and the roster is longer than that', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-trainer-tr_1', {}, WAIT);
    expect(getByTestId('home-trainer-tr_2')).toBeTruthy();
    expect(getByTestId('home-trainer-tr_3')).toBeTruthy();
    // The fourth is the roster's job, not Home's.
    expect(queryByTestId('home-trainer-tr_4')).toBeNull();
  });

  it('claims no relationship the API does not model', async () => {
    // There is no member↔trainer link on the contract, so the heading is the
    // plain noun. "Your trainer" over an alphabetical roster was a claim.
    const { findByTestId, getByText, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-trainer-tr_1', {}, WAIT);
    expect(getByText('Trainers')).toBeTruthy();
    expect(queryByText('Your trainer')).toBeNull();
    // And no booking button: no member route books a trainer directly.
    expect(queryByText('Book session')).toBeNull();
  });

  it('sends the member to the roster from the section button', async () => {
    const { findByTestId, getByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-trainer-tr_1', {}, WAIT);
    fireEvent.press(getByTestId('home-trainer-all'));
    expect(mockPush).toHaveBeenCalledWith('/trainers');
  });

  it('opens the coach’s SHEET from a row, and navigates nowhere', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-trainer-tr_2', {}, WAIT);
    // Closed until asked for: `TrainerSheet` renders nothing before its first
    // open, so neither of its two requests has been made.
    expect(queryByTestId('home-trainer-sheet')).toBeNull();
    expect(mockGetTrainer).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('home-trainer-tr_2'));
    await findByTestId('home-trainer-sheet', {}, WAIT);
    // The sheet IS the profile — there is no `/trainers/:id` screen to push.
    expect(mockPush).not.toHaveBeenCalled();
    expect(getByTestId('home-trainer-sheet')).toBeTruthy();
  });
});

// ===========================================================================
// 4. THE CHROME AND THE a11y CONTRACT.
// ===========================================================================

describe('the chrome', () => {
  it('greets the member by name, and falls back while the profile is loading', async () => {
    const { findByText } = renderApp(<HomeScreen />);
    // The fallback is on screen from the first frame…
    expect(await findByText('Member', {}, WAIT)).toBeTruthy();
    // …and is replaced by the real name once `/me/profile` lands.
    expect(await findByText('Nino Kapanadze', {}, WAIT)).toBeTruthy();
  });

  it('badges the bell from the unread count and opens the inbox', async () => {
    const { findByTestId, getByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    const bell = getByTestId('home-notifications');
    expect(bell.props.accessibilityLabel).toBe('Notifications');
    fireEvent.press(bell);
    expect(mockPush).toHaveBeenCalledWith('/profile/notifications');
  });

  it('offers NO check-in / QR affordance anywhere', async () => {
    // Removed with `/qr` on 2026-08-31 (Q1). Asserted rather than merely
    // absent, so reinstating it is a deliberate act with a test to answer to.
    const { findByTestId, queryByTestId, queryByText } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    expect(queryByTestId('home-qr')).toBeNull();
    expect(queryByText('Show check-in QR')).toBeNull();
    expect(mockPush).not.toHaveBeenCalledWith('/qr');
  });

  it('announces the screen title first, then its section headings in order', async () => {
    const { findByTestId, getAllByRole } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    // Per plan §6 as amended: the ORDERED list, which catches both a missing
    // screen title and a stray heading. The membership block and the counters
    // are unheaded on the artboard and stay that way.
    expect(headerTexts(getAllByRole('header'))).toEqual([
      'Welcome back',
      // `MembershipBlock` sets the plan name as a heading — the block's own
      // decision, and the plan NAME rather than a fixed word, which is one more
      // way this assertion notices a hardcoded card.
      'Starter',
      // The bookings the member already holds, straight under the counters —
      // and no "Book a class" heading anywhere, because that section is gone.
      'Your upcoming bookings',
      'Services',
      'Trainers',
      'For your training',
    ]);
  });
});

// ===========================================================================
// 5. THE GYM'S OWN PHOTOGRAPH, ON THE MEMBERSHIP BLOCK.
// ===========================================================================

describe('the membership cover', () => {
  it('draws the gym’s portal photograph as the block’s band', async () => {
    const { findByTestId } = renderApp(<HomeScreen />);
    const image = await findByTestId('home-membership-block-cover-image', HIDDEN, WAIT);
    // `GET /gyms/by-subdomain/:slug` → `portal.loginImageUrl`, straight through.
    expect(image.props.source).toEqual({ uri: 'https://cdn.test/downtown.jpg' });
  });

  it('draws no band for a gym that uploaded none', async () => {
    mockGetGymBySubdomain.mockResolvedValue({
      gymId: 'gym_1',
      name: 'Downtown Strength',
      brand: null,
      timezone: 'Asia/Tbilisi',
      contact: null,
      portal: { loginImageUrl: null, logoUrl: null, primaryColor: '#E4F26A' },
    });
    const { findByTestId, queryByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    expect(queryByTestId('home-membership-block-cover', HIDDEN)).toBeNull();
  });

  // The block is the member's plan; a branding lookup must never hold it up or
  // take it down. The cover is deliberately outside `membershipPhase`.
  it('renders the plan even when the tenant lookup fails', async () => {
    mockGetGymBySubdomain.mockRejectedValue(new Error('boom'));
    const { findByTestId, getByText, queryByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    expect(getByText('Starter')).toBeTruthy();
    expect(queryByTestId('home-membership-error')).toBeNull();
    expect(queryByTestId('home-membership-block-cover', HIDDEN)).toBeNull();
  });
});

// ===========================================================================
// 6. THE PROMOTIONAL REEL — THE ONE BLOCK THAT IS NOT A SECTION.
// ===========================================================================

describe('the banner carousel', () => {
  it('draws one slide per live banner, above the membership block', async () => {
    const { findByTestId, getByTestId, toJSON } = renderApp(<HomeScreen />);
    await findByTestId('home-banners-slide-bn_1', {}, WAIT);
    expect(getByTestId('home-banners-slide-bn_2')).toBeTruthy();
    expect(getByTestId('home-banners-slide-bn_3')).toBeTruthy();

    // Under the greeting, above the plan — the reel's whole placement brief,
    // asserted by where the two nodes fall in the rendered tree.
    const tree = JSON.stringify(toJSON());
    expect(tree.indexOf('home-banners')).toBeLessThan(tree.indexOf('home-membership'));
  });

  it('is ABSENT for a gym running no campaigns — not an empty state', async () => {
    seedEmpty();
    const { findByTestId, queryByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-upcoming-empty', {}, WAIT);
    expect(queryByTestId('home-banners')).toBeNull();
  });

  it('is ABSENT when the request fails, with no error box and no retry', async () => {
    // Marketing does not get the section machinery: "we couldn't load this ·
    // Try again" over an advertisement is chrome apologising for an advert.
    mockListBanners.mockRejectedValue(new Error('boom'));
    const { findByTestId, queryByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-membership-block', {}, WAIT);
    expect(queryByTestId('home-banners')).toBeNull();
    expect(queryByTestId('home-banners-error')).toBeNull();
    expect(queryByTestId('home-banners-retry')).toBeNull();
    expect(queryByTestId('home-banners-loading')).toBeNull();
  });

  it('follows an in-app slide into the app rather than out of it', async () => {
    const { findByTestId, getByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-banners-slide-bn_1', {}, WAIT);
    fireEvent.press(getByTestId('home-banners-slide-bn_1'));
    expect(mockPush).toHaveBeenCalledWith('/shop');
  });

  it('does not navigate for a slide with no link', async () => {
    const { findByTestId, getByTestId } = renderApp(<HomeScreen />);
    await findByTestId('home-banners-slide-bn_3', {}, WAIT);
    fireEvent.press(getByTestId('home-banners-slide-bn_3'));
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe('copy', () => {
  it('is entirely from the catalogue, in both locales', async () => {
    const ka = renderApp(<HomeScreen />, { locale: 'ka' });
    await ka.findByTestId('home-membership-block', {}, WAIT);
    const tree = JSON.stringify(ka.toJSON());

    expect(ka.getByText('კეთილი დაბრუნება')).toBeTruthy();
    expect(ka.queryByText('Welcome back')).toBeNull();
    expect(tree).not.toMatch(/member\.home\./);
    expect(tree).not.toMatch(/member\.membership\./);
  });
});
