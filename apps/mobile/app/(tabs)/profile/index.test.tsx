// Profile — the whole account surface on one screen, asserted top to bottom.
//
// ===========================================================================
// `/profile/settings` IS GONE AND ITS TEST WENT WITH IT, SO EVERY ASSERTION
// THAT FILE CARRIED HAD TO LAND HERE OR BE LOST.
//
// The ones that moved verbatim are the ones worth naming: the gym row
// SKELETONS rather than saying "No gym selected" while the lookup is in
// flight; an unknown role falls back to its raw value rather than painting a
// key path; sign-out confirms first; there is no appearance row and no
// notification-preference switch, because v1 is dark-only and no preferences
// controller exists on the API.
//
// The transport is mocked and everything above it is real, for the reason
// `home.test.tsx` gives at length: mocking the hooks would let a test assert a
// state the query library cannot produce. That is why the gym lookup is mocked
// at `lib/api/gyms` — a never-settling promise is how "pending" is produced
// here, rather than by handing the screen a hand-written query object.
//
// `renderApp`, not `renderScreen`: the resume-membership path calls `useToast`.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent, waitFor } from '@testing-library/react-native';
import type { GetMeSubscriptionResponse, MeSubscription } from '@fit/types';

import ProfileScreen from './index';
import { renderApp } from '../../../test-support/render';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };
const DAY = 86_400_000;

const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

let mockSession = {
  status: 'signed-in' as 'hydrating' | 'signed-out' | 'signed-in',
  userId: 'usr_1' as string | null,
  gymId: 'gym_1' as string | null,
  role: 'MEMBER' as string | null,
  expiresAt: null as number | null,
};
jest.mock('../../../hooks/useSession', () => ({ useSession: () => mockSession }));

let mockGymSlug: string | undefined = 'downtown-strength';
const mockSignOut = jest.fn(() => Promise.resolve({ revoked: true }));
// Only the two functions the screen imports. `useSession` is mocked above, so
// nothing in this tree reaches for the store the real module maintains.
jest.mock('../../../lib/auth/session', () => ({
  resolveGymSlug: () => mockGymSlug,
  signOut: () => mockSignOut(),
}));

const mockGetGymBySubdomain = jest.fn();
jest.mock('../../../lib/api/gyms', () => ({
  getGymBySubdomain: () => mockGetGymBySubdomain() as unknown,
}));

const mockGetMyProfile = jest.fn();
const mockGetMySubscription = jest.fn();
jest.mock('../../../lib/api/me', () => ({
  getMyProfile: () => mockGetMyProfile() as unknown,
  getMySubscription: () => mockGetMySubscription() as unknown,
  getMyGoals: () => Promise.resolve({ goals: [] }),
}));

const mockListMyBookings = jest.fn();
jest.mock('../../../lib/api/bookings', () => ({
  listMyBookings: () => mockListMyBookings() as unknown,
}));

const mockListMyCreditPacks = jest.fn();
jest.mock('../../../lib/api/credit-packs', () => ({
  listMyCreditPacks: () => mockListMyCreditPacks() as unknown,
  listCreditPackCatalogue: () => Promise.resolve({ packs: [] }),
  purchaseCreditPack: () => Promise.resolve({}),
}));

const mockGetUnreadCount = jest.fn();
jest.mock('../../../lib/api/notifications', () => ({
  getUnreadCount: () => mockGetUnreadCount() as unknown,
  listNotifications: () => Promise.resolve({ data: [], total: 0, page: 1, limit: 20, unread: 0 }),
  markNotificationsRead: () => Promise.resolve({}),
}));

const mockFreeze = jest.fn();
const mockUnfreeze = jest.fn();
jest.mock('../../../lib/api/subscriptions', () => ({
  enrollSubscription: () => Promise.resolve({}),
  freezeSubscription: (input: unknown) => mockFreeze(input) as unknown,
  unfreezeSubscription: (input: unknown) => mockUnfreeze(input) as unknown,
}));

function subscription(overrides: Partial<MeSubscription> = {}): MeSubscription {
  const now = Date.now();
  return {
    id: 'sub_1',
    status: 'ACTIVE',
    planName: 'Premium',
    priceAmount: 5000,
    currency: 'GEL',
    interval: 'MONTH',
    currentPeriodStart: new Date(now - 10 * DAY).toISOString(),
    currentPeriodEnd: new Date(now + 20 * DAY).toISOString(),
    cancelAtPeriodEnd: false,
    frozenAt: null,
    frozenUntil: null,
    freezeDaysPerPeriod: 30,
    freezeDaysUsed: 0,
    freezeDaysRemaining: 30,
    memberSince: '2024-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function membership(sub: MeSubscription | null): GetMeSubscriptionResponse {
  return { subscription: sub, invoices: [] };
}

function seed() {
  mockGetMyProfile.mockResolvedValue({
    profile: { userId: 'u1', name: 'Nino Kapanadze', email: 'n@example.com', phone: null },
  });
  mockGetMySubscription.mockResolvedValue(membership(subscription()));
  mockGetGymBySubdomain.mockResolvedValue({ gymId: 'gym_1', name: 'Downtown Strength' });
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
  mockListMyCreditPacks.mockResolvedValue({
    packs: [{ id: 'cp', totalCredits: 5, remainingCredits: 2, expiresAt: null, planTitle: null }],
  });
  mockGetUnreadCount.mockResolvedValue({ unread: 0 });
  mockUnfreeze.mockResolvedValue({ newPeriodEnd: new Date().toISOString() });
}

beforeEach(() => {
  mockPush.mockClear();
  mockReplace.mockClear();
  mockSignOut.mockClear();
  mockGymSlug = 'downtown-strength';
  mockSession = {
    status: 'signed-in',
    userId: 'usr_1',
    gymId: 'gym_1',
    role: 'MEMBER',
    expiresAt: null,
  };
  for (const fake of [
    mockGetMyProfile,
    mockGetMySubscription,
    mockGetGymBySubdomain,
    mockListMyBookings,
    mockListMyCreditPacks,
    mockGetUnreadCount,
    mockFreeze,
    mockUnfreeze,
  ]) {
    fake.mockReset();
  }
  seed();
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

/**
 * The first `stroke` under `node`, at any depth.
 *
 * `Icon` renders `<Svg><Path stroke={resolved} /></Svg>` and `react-native-svg`
 * mounts a group between the two, so the value is two levels down rather than
 * one — and reading it positionally would break the day that changes.
 */
function strokeOf(node: unknown): string | undefined {
  const found = node as { props?: { stroke?: unknown }; children?: readonly unknown[] };
  if (typeof found.props?.stroke === 'string') return found.props.stroke;
  for (const child of found.children ?? []) {
    const stroke = strokeOf(child);
    if (stroke !== undefined) return stroke;
  }
  return undefined;
}

/** The text of every `accessibilityRole="header"`, in tree order. */
function headerTitles(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => (node as { props?: { children?: unknown } }).props?.children);
}

/**
 * RNTL types a host node's `props` as `any`, so reaching into it is an unsafe
 * member access the shared lint config (correctly) refuses. Narrowed once here,
 * the way `@fit/ui-mobile`'s own tests do.
 */
function a11yState(node: unknown): { disabled?: boolean; selected?: boolean; busy?: boolean } {
  const props = (node as { props?: { accessibilityState?: unknown } }).props;
  return (props?.accessibilityState as { selected?: boolean } | undefined) ?? {};
}

/**
 * Every door on the screen, and the route it opens.
 *
 * ===========================================================================
 * ONE DOOR PER DESTINATION. `profile-row-edit` is the identity BLOCK — it is
 * not a `ListRow`, which is why the `accessibilityLabel` assertion below reads
 * the member's name rather than a menu title — and `/profile/membership` is
 * reached through the membership card's own "Manage plan" button rather than
 * through a row repeating it. Adding either as a row is how this screen grew
 * to nine rows the first time.
 * ===========================================================================
 */
const ROWS: readonly (readonly [testID: string, href: string])[] = [
  ['profile-row-edit', '/profile/edit'],
  ['profile-row-payments', '/profile/billing'],
  ['profile-row-notification-settings', '/profile/notification-settings'],
  ['profile-row-activity', '/profile/activity'],
];

/**
 * Rows this screen deliberately does not carry, and where each one went.
 *
 *   membership       the card's own "Manage plan" button, on this screen
 *   billing          `profile-row-payments`, above (the id changed with the copy)
 *   notifications    the bell in this AppBar → `/profile/notifications`
 *   trainers         Home (`home.tsx:378`)
 *   training         Home (`home.tsx:419`)
 *   bookings         the Classes tab
 *   settings         `/profile/settings` no longer exists — this IS that screen
 *   goals            `/profile/goals` still renders and now has no link at all
 *
 * Asserted rather than merely absent: putting one back is a deliberate act with
 * a test to answer to, and the screen this list exists to stop being is the
 * nine-row one.
 */
const ABSENT: readonly string[] = [
  'profile-row-membership',
  'profile-row-billing',
  'profile-row-notifications',
  'profile-row-trainers',
  'profile-row-training',
  'profile-row-bookings',
  'profile-row-settings',
  'profile-row-goals',
];

describe('the menu', () => {
  it('renders every row', async () => {
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    // The identity block is a SECTION, so it skeletons until the profile call
    // lands and `profile-screen` alone is not far enough to wait.
    await findByTestId('profile-row-edit', {}, WAIT);
    for (const [testID] of ROWS) {
      expect(getByTestId(testID)).toBeTruthy();
    }
  });

  it.each(ROWS)('%s opens %s', async (testID, href) => {
    const { findByTestId } = renderApp(<ProfileScreen />);
    fireEvent.press(await findByTestId(testID, {}, WAIT));
    expect(mockPush).toHaveBeenCalledWith(href);
  });

  it('carries none of the rows that are somebody else’s door', async () => {
    const { findByTestId, queryByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-screen', {}, WAIT);
    for (const testID of ABSENT) {
      expect(queryByTestId(testID)).toBeNull();
    }
  });

  it('reaches the membership screen through the card, not through a row', async () => {
    const { findByTestId } = renderApp(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-membership-block-manage', {}, WAIT));
    expect(mockPush).toHaveBeenCalledWith('/profile/membership');
  });

  it('offers no member-card row — the screen it opened is gone', async () => {
    // Removed with `/qr` on 2026-08-31 (Q1: no scanner integration and no
    // member-scoped check-in endpoint). Asserted rather than merely absent, so
    // reinstating the row is a deliberate act with a test to answer to.
    const { findByTestId, queryByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-screen', {}, WAIT);
    expect(queryByTestId('profile-row-qr')).toBeNull();
    expect(mockPush).not.toHaveBeenCalledWith('/qr');
  });

  it('names every row and gives each a pressable role', async () => {
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-row-edit', {}, WAIT);
    for (const [testID] of ROWS) {
      const row = getByTestId(testID);
      expect(row.props.accessibilityRole).toBe('button');
      expect(typeof row.props.accessibilityLabel).toBe('string');
      expect(row.props.accessibilityLabel).not.toBe('');
    }
  });

  // ==========================================================================
  // A COLOUR ROLE THAT DOES NOT EXIST IS NOT AN ERROR ANYWHERE ELSE.
  //
  // `resolveColor` returns the raw string for anything that is not a key of the
  // theme, so `color="textMuted"` — a role this design system does not have —
  // type-checks, renders, and reaches `react-native-svg` as
  // `stroke="textMuted"`, which paints nothing. The chevron was simply gone
  // from the running app, with no failing test and no warning; the RESOLVED
  // value is the only place it shows. This is that assertion.
  // ==========================================================================
  it('draws the identity chevron in a colour the theme actually has', async () => {
    const { findByTestId } = renderApp(<ProfileScreen />);
    // `includeHiddenElements`: the chevron sits inside the wrapper that hides
    // the row's children from the accessibility tree, which is exactly right —
    // the ROW is the control and the chevron is decoration — and which RNTL
    // reads as "not queryable" unless asked.
    const svg = await findByTestId('profile-edit-chevron', { includeHiddenElements: true }, WAIT);
    expect(strokeOf(svg)).toMatch(/^(#|rgb)/);
  });

  it('speaks the identity block as the member, and as the way to edit them', async () => {
    // The block replaced a row titled "Personal information". A screen-reader
    // user has to be told BOTH things the sighted affordance says: whose
    // profile this is, and that pressing it opens the editor.
    const { findByTestId } = renderApp(<ProfileScreen />);
    const row = await findByTestId('profile-row-edit', {}, WAIT);
    expect(row.props.accessibilityLabel).toBe('Nino Kapanadze');
    expect(row.props.accessibilityHint).toBe('Personal information');
  });
});

describe('the live sections', () => {
  it('renders the membership block from the payload', async () => {
    const { findByTestId, getByText } = renderApp(<ProfileScreen />);
    await findByTestId('profile-membership-block', {}, WAIT);
    expect(getByText('Premium')).toBeTruthy();
    // Ten days into a thirty-day period.
    expect(getByText(/20 of 30 days left/)).toBeTruthy();
  });

  // The two counters and the achievement rail moved to `/profile/activity` on
  // 2026-09-05, and their assertions moved with them — see `activity.test.tsx`.
  // What stays here is the row that opens them, in the ROWS table above.

  it('shows the live PT balance and sends "Buy" to Billing', async () => {
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-pt-balance', {}, WAIT);
    expect(getByTestId('profile-pt-balance').props.children).toBe('2 PT sessions left');
    fireEvent.press(getByTestId('profile-pt-buy'));
    expect(mockPush).toHaveBeenCalledWith('/profile/billing');
  });
});

describe('the account details', () => {
  it('names the gym once the lookup answers', async () => {
    const { findByText } = renderApp(<ProfileScreen />);
    expect(await findByText('Downtown Strength', {}, WAIT)).toBeTruthy();
  });

  it('SKELETONS while the lookup is out — "No gym" is an answer, not a placeholder', async () => {
    // `settings.account.noGym` states, in the member's own language, that the
    // member belongs to no gym. Rendering it while the request is still on the
    // wire is a DEFAULT RENDERED AS DATA: the row asserts something it cannot
    // know, and the member has no way to tell it from the real thing.
    mockGetGymBySubdomain.mockReturnValue(new Promise(() => undefined));
    const { findByTestId, queryByText, queryByTestId } = renderApp(<ProfileScreen />);
    expect(await findByTestId('profile-gym-loading', {}, WAIT)).toBeTruthy();
    expect(queryByText('No gym selected')).toBeNull();
    expect(queryByTestId('profile-gym-error')).toBeNull();
  });

  it('still says "no gym selected" when there is no slug to look up', async () => {
    // Nothing is in flight: `useGymBySlug(null)` is disabled, so the sentence
    // is the answer rather than a placeholder standing in for one.
    mockGymSlug = undefined;
    const { findByText, queryByTestId } = renderApp(<ProfileScreen />);
    expect(await findByText('No gym selected', {}, WAIT)).toBeTruthy();
    expect(queryByTestId('profile-gym-loading')).toBeNull();
    expect(mockGetGymBySubdomain).not.toHaveBeenCalled();
  });

  it('shows an error with a working retry when the gym lookup fails', async () => {
    mockGetGymBySubdomain.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-gym-error', {}, WAIT);

    mockGetGymBySubdomain.mockResolvedValue({ gymId: 'gym_1', name: 'Downtown Strength' });
    // NEVER `.refetch()` — the invalidation matrix is the deliverable, and a
    // screen that refetches by hand is a screen that can disagree with it.
    fireEvent.press(getByTestId('profile-gym-retry'));
    await waitFor(() => {
      expect(mockGetGymBySubdomain).toHaveBeenCalledTimes(2);
    }, WAIT);
  });

  it('keeps every other row intact when the gym lookup fails', async () => {
    // The gym name is decoration; the member id is not. A failed lookup must
    // not take the screen down with it.
    mockGetGymBySubdomain.mockRejectedValue(new Error('boom'));
    const { findByTestId, getByTestId, getByText } = renderApp(<ProfileScreen />);
    await findByTestId('profile-gym-error', {}, WAIT);
    expect(getByTestId('profile-member-id')).toBeTruthy();
    expect(getByText('usr_1')).toBeTruthy();
    expect(getByTestId('profile-version')).toBeTruthy();
    expect(getByTestId('profile-sign-out')).toBeTruthy();
    expect(getByTestId('profile-row-activity')).toBeTruthy();
  });

  it('translates a role the catalogue knows', async () => {
    const { findByText } = renderApp(<ProfileScreen />);
    expect(await findByText('Member', {}, WAIT)).toBeTruthy();
  });

  it('falls back to the raw role rather than rendering a key path', async () => {
    // `session.role` is whatever the token said. A template literal alone would
    // happily build `settings.account.roles.AUDITOR` and paint it.
    mockSession = { ...mockSession, role: 'AUDITOR' };
    const screen = renderApp(<ProfileScreen />);
    expect(await screen.findByText('AUDITOR', {}, WAIT)).toBeTruthy();
    expect(JSON.stringify(screen.toJSON())).not.toMatch(/settings\.account\.roles/);
  });

  it('omits the role row entirely when the token carried none', async () => {
    mockSession = { ...mockSession, role: null };
    const { findByTestId, queryByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-member-id', {}, WAIT);
    expect(queryByTestId('profile-role')).toBeNull();
  });

  it('shows the access token’s sub as the member id', async () => {
    // There is no short human member code anywhere on the API. Minting one
    // client-side would produce an id the admin console cannot look up.
    const { findByText } = renderApp(<ProfileScreen />);
    expect(await findByText('usr_1', {}, WAIT)).toBeTruthy();
  });
});

describe('language, sign out and the version', () => {
  it('offers the language choice as a radio group', async () => {
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    const group = await findByTestId('profile-language', {}, WAIT);
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(getByTestId('profile-language-en')).toBeTruthy();
    expect(getByTestId('profile-language-ka')).toBeTruthy();
  });

  it('actually switches the locale', async () => {
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />, { locale: 'en' });
    await findByTestId('profile-language', {}, WAIT);
    // A row's TITLE is inside the wrapper `ListRow` hides from the
    // accessibility tree — the row is the control — so the spoken name is what
    // a query can reach, and it is the same string.
    expect(getByTestId('profile-row-payments').props.accessibilityLabel).toBe('Payment history');
    fireEvent.press(getByTestId('profile-language-ka'));

    // Let `I18nProvider`'s persisted-locale read land before asserting. It is
    // an AsyncStorage round trip started at mount, and its `setLocaleState`
    // would otherwise resolve outside `act`. It must NOT undo the choice —
    // `userChose` is exactly the ref that guards against a stored value
    // overwriting a selection the user just made — so this is also the
    // assertion that the switch survives hydration.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(a11yState(getByTestId('profile-language-ka')).selected).toBe(true);
    // The switch reached the PROVIDER rather than only the control's own
    // selected state: a row a scroll away is Georgian now.
    expect(getByTestId('profile-row-payments').props.accessibilityLabel).toBe('გადახდების ისტორია');
  });

  it('confirms before signing out, then signs out and leaves', async () => {
    const { findByTestId, getByTestId, queryByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-sign-out', {}, WAIT);
    expect(queryByTestId('profile-sign-out-confirm')).toBeNull();

    fireEvent.press(getByTestId('profile-sign-out'));
    expect(mockSignOut).not.toHaveBeenCalled();
    expect(getByTestId('profile-sign-out-confirm')).toBeTruthy();

    fireEvent.press(getByTestId('profile-sign-out-confirm-confirm'));
    await waitFor(() => {
      expect(mockSignOut).toHaveBeenCalledTimes(1);
    }, WAIT);
    // `signOut()` publishes to the session store and the root guard moves the
    // user; `/` is the nudge that makes it re-evaluate now.
    expect(mockReplace).toHaveBeenCalledWith('/');
  });

  it('ends on the app version, from app.json', async () => {
    const { findByTestId } = renderApp(<ProfileScreen />);
    const version = await findByTestId('profile-version', {}, WAIT);
    expect(version.props.children).toBe('FormaCore · v0.1.0');
  });

  it('offers the appearance choice as a radio group — two modes, dark first', async () => {
    // The inverse of the case this replaces. Light mode shipped on 2026-09-09,
    // so the control that "returns with light mode" has returned.
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    const group = await findByTestId('profile-appearance', {}, WAIT);
    expect(group.props.accessibilityRole).toBe('radiogroup');
    expect(getByTestId('profile-appearance-dark')).toBeTruthy();
    expect(getByTestId('profile-appearance-light')).toBeTruthy();
    // Dark leads, and it is the mode the app starts in.
    expect(a11yState(getByTestId('profile-appearance-dark')).selected).toBe(true);
    expect(a11yState(getByTestId('profile-appearance-light')).selected).toBe(false);
  });

  it('has NO "follows system" option — the member decides, not the phone', async () => {
    // `settings.preferences.appearanceSystem` and `menu.appearanceHint` both
    // still carry that string and both stay unused. See the module header.
    const { findByTestId, queryByText } = renderApp(<ProfileScreen />);
    await findByTestId('profile-screen', {}, WAIT);
    expect(queryByText('Follows system')).toBeNull();
  });

  it('actually switches the theme', async () => {
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-appearance', {}, WAIT);
    fireEvent.press(getByTestId('profile-appearance-light'));

    // Same hydration race as the locale above: `ThemePreferenceProvider` reads
    // the persisted mode at mount, and `userChose` is what stops that read from
    // undoing a tap that landed first. Letting it resolve here asserts both.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(a11yState(getByTestId('profile-appearance-light')).selected).toBe(true);
    expect(a11yState(getByTestId('profile-appearance-dark')).selected).toBe(false);
  });

  it('repaints the tree, not just the control', async () => {
    // The switch reached the kit's `ThemeProvider`, which is the whole point: a
    // control that only tracks its own selected state is the "switch that does
    // nothing" this screen refused to ship for eight months. The version line is
    // the probe because it is the one node on the screen that renders in every
    // phase — no query behind it — and it is coloured `textSecondary`, which is
    // a different value in each map.
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-appearance', {}, WAIT);
    const darkStyle: unknown = getByTestId('profile-version').props.style;

    fireEvent.press(getByTestId('profile-appearance-light'));
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    expect(getByTestId('profile-version').props.style).not.toEqual(darkStyle);
  });

  it('has NO notification-preference switch — there is no controller behind one', async () => {
    // The ROW that opens `/profile/notification-settings` is in ROWS above and
    // is honest about being device-local. A switch here would be a control that
    // silently does nothing, which is what the deleted app shipped.
    const { findByTestId, queryByText } = renderApp(<ProfileScreen />);
    await findByTestId('profile-screen', {}, WAIT);
    expect(queryByText('Push notifications')).toBeNull();
    expect(queryByText('Class reminders')).toBeNull();
  });
});

describe('§6, per section', () => {
  const SECTIONS = ['profile-identity', 'profile-membership', 'profile-credits'] as const;

  it('skeletons each section rather than blanking the screen', () => {
    const { getByTestId } = renderApp(<ProfileScreen />);
    for (const section of SECTIONS) {
      expect(getByTestId(`${section}-loading`)).toBeTruthy();
    }
    // The menu does not wait on anything — it needs no endpoint.
    expect(getByTestId('profile-row-activity')).toBeTruthy();
  });

  it('gives the membership section its own error and a working retry', async () => {
    mockGetMySubscription.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-membership-error', {}, WAIT);
    // One failure does not take the rest of the screen with it.
    expect(getByTestId('profile-row-activity')).toBeTruthy();

    mockGetMySubscription.mockResolvedValue(membership(subscription()));
    fireEvent.press(getByTestId('profile-membership-retry'));
    await findByTestId('profile-membership-block', {}, WAIT);
    expect(mockGetMySubscription).toHaveBeenCalledTimes(2);
  });

  it('renders an OFFLINE branch rather than skeletons forever', async () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<ProfileScreen />);
    await waitFor(() => {
      expect(getByTestId('profile-offline')).toBeTruthy();
    }, WAIT);
    expect(getByTestId('profile-membership-offline')).toBeTruthy();
    expect(mockGetMySubscription).not.toHaveBeenCalled();
  });

  it('renders a member with no subscription as a real state', async () => {
    mockGetMySubscription.mockResolvedValue(membership(null));
    const { findByTestId, getByText } = renderApp(<ProfileScreen />);
    await findByTestId('profile-membership-block-none', {}, WAIT);
    expect(getByText('No active membership')).toBeTruthy();
  });
});

describe('freeze and resume', () => {
  it('offers Freeze on a live plan with an allowance, and opens the sheet', async () => {
    const { findByTestId, getByTestId } = renderApp(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-membership-block-freeze', {}, WAIT));
    expect(getByTestId('freeze-sheet-duration')).toBeTruthy();
  });

  it('hides Freeze on a plan whose allowance is spent', async () => {
    // Not disabled — absent. The membership screen renders the sentence that
    // explains why, and a dead button here would say nothing.
    mockGetMySubscription.mockResolvedValue(
      membership(
        subscription({ freezeDaysPerPeriod: 14, freezeDaysUsed: 14, freezeDaysRemaining: 0 }),
      ),
    );
    const { findByTestId, queryByTestId } = renderApp(<ProfileScreen />);
    await findByTestId('profile-membership-block', {}, WAIT);
    expect(queryByTestId('profile-membership-block-freeze')).toBeNull();
  });

  it('offers Resume on a frozen plan, and writes through the mutation', async () => {
    mockGetMySubscription.mockResolvedValue(
      membership(
        subscription({
          status: 'FROZEN',
          frozenUntil: new Date(Date.now() + 5 * DAY).toISOString(),
        }),
      ),
    );
    const { findByTestId } = renderApp(<ProfileScreen />);
    fireEvent.press(await findByTestId('profile-membership-block-resume', {}, WAIT));
    await waitFor(() => {
      expect(mockUnfreeze).toHaveBeenCalledWith({ subscriptionId: 'sub_1' });
    }, WAIT);
  });

  it('never offers a way to CANCEL the membership', async () => {
    // `cancelAtPeriodEnd` is on the payload and no member route writes it
    // (plan §7). It is a status line, not a button.
    mockGetMySubscription.mockResolvedValue(membership(subscription({ cancelAtPeriodEnd: true })));
    const { findByTestId, getByText, queryByText } = renderApp(<ProfileScreen />);
    await findByTestId('profile-membership-block', {}, WAIT);
    expect(getByText(/won't renew/)).toBeTruthy();
    expect(queryByText('Cancel membership')).toBeNull();
  });
});

describe('the chrome', () => {
  it('announces the screen title, the block’s plan, then the one section heading', async () => {
    const { findByTestId, getAllByRole } = renderApp(<ProfileScreen />);
    await findByTestId('profile-membership-block', {}, WAIT);
    // §6 item 7 as amended: assert the ORDERED list. The member's own NAME is
    // deliberately not in it — identity is not a landmark, and RN has no
    // `accessibilityLevel` to rank a second title against the first.
    // Three, and every one is earned: the screen title, the membership block's
    // plan name, and the only group of rows on the screen that needs saying
    // what it is. The menu above it and the language card below it do not: a
    // heading over the language switch would read "ენა" above "ენა", which is
    // the trap the removed "Settings" heading fell into.
    expect(headerTitles(getAllByRole('header'))).toEqual(['Profile', 'Premium', 'Account details']);
  });

  it('opens the inbox from the bell', async () => {
    const { findByTestId } = renderApp(<ProfileScreen />);
    const bell = await findByTestId('profile-notifications', {}, WAIT);
    expect(bell.props.accessibilityLabel).toBe('Notifications');
    fireEvent.press(bell);
    expect(mockPush).toHaveBeenCalledWith('/profile/notifications');
  });
});

describe('localisation', () => {
  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<ProfileScreen />, { locale });
      await screen.findByTestId('profile-membership-block', {}, WAIT);
      const json = JSON.stringify(screen.toJSON());
      expect(json).not.toMatch(/"member\.profile\./i);
      expect(json).not.toMatch(/"member\.membership\./i);
      expect(json).not.toMatch(/"settings\.[a-z]/i);
      expect(json).not.toMatch(/"errors\.[a-z]/i);
      screen.unmount();
    }
  });

  it('renders no key paths in the gym error branch either', async () => {
    // `errors.generic` is real, translated copy standing in for the
    // `settings.error` / `settings.retry` pair that does not exist. It has to
    // resolve in both locales, not just read plausibly in English.
    mockGetGymBySubdomain.mockRejectedValue(new Error('boom'));
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<ProfileScreen />, { locale });
      await screen.findByTestId('profile-gym-error', {}, WAIT);
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/"errors\.[a-z]/i);
      screen.unmount();
    }
  });

  it('is not English-baked', async () => {
    const en = renderApp(<ProfileScreen />, { locale: 'en' });
    const ka = renderApp(<ProfileScreen />, { locale: 'ka' });
    expect((await en.findByTestId('profile-row-payments', {}, WAIT)).props.accessibilityLabel).toBe(
      'Payment history',
    );
    expect(
      (await ka.findByTestId('profile-row-payments', {}, WAIT)).props.accessibilityLabel,
    ).not.toBe('Payment history');
  });
});
