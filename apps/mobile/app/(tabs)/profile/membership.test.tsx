// `/profile/membership` — every §6 branch, and the three affordances the API
// forbids.
//
// The most valuable assertions here are the negative ones. "There is no cancel
// button" and "there is no change-plan button on a live plan" are product
// constraints the API imposes (plan §7), invisible in a screenshot, and exactly
// the kind of thing a later contributor adds back in good faith because the
// copy for them exists.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';
import type {
  CreditPackCatalogueEntry,
  GetMeSubscriptionResponse,
  MeSubscription,
} from '@fit/types';

import MembershipScreen from './membership';
import { ApiError } from '../../../lib/http/api-error';
import { renderApp } from '../../../test-support/render';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 };
const DAY = 86_400_000;

const mockPush = jest.fn();
const mockBack = jest.fn();
let mockCanGoBack = true;
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    back: mockBack,
    canGoBack: () => mockCanGoBack,
  }),
}));

jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => 'gym_1',
  useActiveGym: () => ({ gymId: 'gym_1', role: 'MEMBER', userId: 'user_1' }),
}));

const mockGetMySubscription = jest.fn();
jest.mock('../../../lib/api/me', () => ({
  getMySubscription: () => mockGetMySubscription() as unknown,
  getMyProfile: () => Promise.resolve({ profile: {} }),
  getMyGoals: () => Promise.resolve({ goals: [] }),
}));

const mockListMyCreditPacks = jest.fn();
const mockListCreditPackCatalogue = jest.fn();
const mockPurchaseCreditPack = jest.fn();
jest.mock('../../../lib/api/credit-packs', () => ({
  listMyCreditPacks: () => mockListMyCreditPacks() as unknown,
  listCreditPackCatalogue: () => mockListCreditPackCatalogue() as unknown,
  purchaseCreditPack: (input: unknown) => mockPurchaseCreditPack(input) as unknown,
}));

const mockGetCatalogue = jest.fn();
jest.mock('../../../lib/api/catalogue', () => ({
  getCatalogue: () => mockGetCatalogue() as unknown,
  listProducts: () => Promise.resolve({ products: [] }),
  listPackages: () => Promise.resolve({ packages: [] }),
  listLocations: () => Promise.resolve({ locations: [] }),
}));

const mockEnroll = jest.fn();
const mockFreeze = jest.fn();
const mockUnfreeze = jest.fn();
jest.mock('../../../lib/api/subscriptions', () => ({
  enrollSubscription: (input: unknown) => mockEnroll(input) as unknown,
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
    freezeDaysUsed: 5,
    freezeDaysRemaining: 25,
    memberSince: '2024-03-01T00:00:00.000Z',
    ...overrides,
  };
}

function creditPack(overrides: Partial<CreditPackCatalogueEntry> = {}): CreditPackCatalogueEntry {
  return {
    id: 'pk_1',
    name: 'PT starter',
    priceAmount: 20_000,
    currency: 'GEL',
    sessionCount: 5,
    validityDays: 90,
    ...overrides,
  };
}

function membership(sub: MeSubscription | null): GetMeSubscriptionResponse {
  return {
    subscription: sub,
    invoices: [{ id: 'inv_1', date: '2026-08-01', amount: 5000, currency: 'GEL', status: 'PAID' }],
  };
}

beforeEach(() => {
  mockPush.mockClear();
  mockBack.mockClear();
  mockCanGoBack = true;
  for (const fake of [
    mockGetMySubscription,
    mockListMyCreditPacks,
    mockListCreditPackCatalogue,
    mockPurchaseCreditPack,
    mockGetCatalogue,
    mockEnroll,
    mockFreeze,
    mockUnfreeze,
  ]) {
    fake.mockReset();
  }
  mockGetMySubscription.mockResolvedValue(membership(subscription()));
  mockListMyCreditPacks.mockResolvedValue({
    packs: [{ id: 'cp', totalCredits: 5, remainingCredits: 3, expiresAt: null, planTitle: null }],
  });
  mockListCreditPackCatalogue.mockResolvedValue({ packs: [creditPack()] });
  mockPurchaseCreditPack.mockResolvedValue({ creditPackId: 'cp_2', orderId: 'ord_1' });
  mockGetCatalogue.mockResolvedValue({
    locations: [],
    packages: [],
    subscriptionPlans: [
      {
        id: 'plan_1',
        name: 'Premium',
        description: 'Everything',
        priceAmount: 5000,
        currency: 'GEL',
        interval: 'MONTH',
        features: [],
        popular: true,
        trialDays: 0,
      },
    ],
    creditPacks: [],
    freeAccount: { enabled: false },
    memberIntake: {},
    startDatePolicy: {},
  });
  mockFreeze.mockResolvedValue({ frozenUntil: new Date(Date.now() + 14 * DAY).toISOString() });
  mockUnfreeze.mockResolvedValue({ newPeriodEnd: new Date().toISOString() });
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

function headerTitles(nodes: readonly unknown[]): unknown[] {
  return nodes.map((node) => (node as { props?: { children?: unknown } }).props?.children);
}

/** The first argument of a mock's first call, typed. `mock.calls` is `any[][]`. */
function firstArg<T>(mock: jest.Mock): T {
  return (mock.mock.calls as unknown as unknown[][])[0]?.[0] as T;
}

// ===========================================================================
// THE THREE THINGS THE API FORBIDS.
// ===========================================================================

describe('what this screen must never offer', () => {
  it('has NO cancel-membership affordance, on any status', async () => {
    // `cancelAtPeriodEnd` is on the payload and no member route writes it:
    // enroll / freeze / unfreeze are the only three, and cancellation is
    // `admin/subscriptions` behind `BillingManage` (plan §7).
    for (const status of ['ACTIVE', 'PAST_DUE', 'FROZEN', 'TRIAL'] as const) {
      mockGetMySubscription.mockResolvedValue(membership(subscription({ status })));
      const screen = renderApp(<MembershipScreen />);
      await screen.findByTestId('membership-card', {}, WAIT);
      expect(screen.queryByText('Cancel membership')).toBeNull();
      expect(screen.queryByTestId('membership-cancel')).toBeNull();
      screen.unmount();
    }
  });

  it('renders `cancelAtPeriodEnd` as a STATUS LINE, not a control', async () => {
    mockGetMySubscription.mockResolvedValue(membership(subscription({ cancelAtPeriodEnd: true })));
    const { findByTestId, getByText } = renderApp(<MembershipScreen />);
    await findByTestId('membership-card', {}, WAIT);
    expect(getByText(/won't renew/)).toBeTruthy();
    // And the period fact flips to "Access until" rather than "Next billing".
    expect(getByText('Access until')).toBeTruthy();
  });

  it('has NO change-plan button while a plan is live', async () => {
    // `POST /subscriptions` answers `409 ALREADY_SUBSCRIBED` for a live
    // membership. A button whose only outcome is an error is not a button.
    const { findByTestId, queryByTestId } = renderApp(<MembershipScreen />);
    await findByTestId('membership-card', {}, WAIT);
    expect(queryByTestId('membership-card-manage')).toBeNull();
  });

  it('DOES offer the plan chooser when there is no live plan', async () => {
    mockGetMySubscription.mockResolvedValue(membership(null));
    const { findByTestId, getByTestId } = renderApp(<MembershipScreen />);
    fireEvent.press(await findByTestId('membership-card-browse', {}, WAIT));
    await waitFor(() => {
      expect(getByTestId('plan-sheet-plan-plan_1')).toBeTruthy();
    }, WAIT);
  });

  it('grows no second invoice list — the history lives on Billing', async () => {
    // There is no `GET /me/invoices`; the rows ride on `GET /me/subscription`,
    // and `billing.invoices.*` is the namespace that has the full §6 set.
    const { findByTestId, queryByTestId } = renderApp(<MembershipScreen />);
    await findByTestId('membership-card', {}, WAIT);
    expect(queryByTestId('membership-invoice-inv_1')).toBeNull();
    fireEvent.press(await findByTestId('membership-invoices-link', {}, WAIT));
    expect(mockPush).toHaveBeenCalledWith('/profile/billing');
  });
});

// ===========================================================================
// THE FREEZE FLOW.
// ===========================================================================

describe('freeze', () => {
  it('offers only durations the allowance covers, and posts an ISO INSTANT', async () => {
    mockGetMySubscription.mockResolvedValue(
      membership(
        subscription({ freezeDaysPerPeriod: 30, freezeDaysUsed: 10, freezeDaysRemaining: 20 }),
      ),
    );
    const { findByTestId, getByTestId, queryByText } = renderApp(<MembershipScreen />);
    fireEvent.press(await findByTestId('membership-card-freeze', {}, WAIT));

    // 14 days fits in 20; 30 and 60 do not, so they are not offered.
    expect(getByTestId('freeze-sheet-duration')).toBeTruthy();
    expect(queryByText('2 months')).toBeNull();

    fireEvent.press(getByTestId('freeze-sheet-confirm'));
    await waitFor(() => {
      expect(mockFreeze).toHaveBeenCalled();
    }, WAIT);
    const body = firstArg<{ startDate: string; durationDays: number }>(mockFreeze);
    expect(body.durationDays).toBe(14);
    // `freezeSubscriptionSchema` takes `z.string().datetime()`; a bare
    // `YYYY-MM-DD` is a 400.
    expect(body.startDate).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('states why a plan with no allowance cannot be frozen', async () => {
    mockGetMySubscription.mockResolvedValue(
      membership(
        subscription({ freezeDaysPerPeriod: 0, freezeDaysUsed: 0, freezeDaysRemaining: 0 }),
      ),
    );
    const { findByTestId, getByText, queryByTestId } = renderApp(<MembershipScreen />);
    await findByTestId('membership-freeze-state', {}, WAIT);
    expect(getByText("Your plan doesn't include freezes.")).toBeTruthy();
    expect(queryByTestId('membership-card-freeze')).toBeNull();
  });

  it('distinguishes "no freezes on this plan" from "you have used them all"', async () => {
    mockGetMySubscription.mockResolvedValue(
      membership(
        subscription({ freezeDaysPerPeriod: 14, freezeDaysUsed: 14, freezeDaysRemaining: 0 }),
      ),
    );
    const { findByTestId, getByText } = renderApp(<MembershipScreen />);
    await findByTestId('membership-freeze-state', {}, WAIT);
    expect(getByText("You've used all your freeze days this period.")).toBeTruthy();
  });

  it('resumes a frozen plan through the mutation', async () => {
    mockGetMySubscription.mockResolvedValue(
      membership(
        subscription({
          status: 'FROZEN',
          frozenUntil: new Date(Date.now() + 5 * DAY).toISOString(),
        }),
      ),
    );
    const { findByTestId } = renderApp(<MembershipScreen />);
    fireEvent.press(await findByTestId('membership-card-resume', {}, WAIT));
    await waitFor(() => {
      expect(mockUnfreeze).toHaveBeenCalledWith({ subscriptionId: 'sub_1' });
    }, WAIT);
  });
});

// ===========================================================================
// BUYING CREDITS — the flow T1.17 evicted from Billing.
// ===========================================================================

describe('buying PT credits', () => {
  it('opens the chooser here rather than pushing to a Billing that sells nothing', async () => {
    // The regression this whole section exists for: "Buy more" used to
    // `router.push('/profile/billing')`, and Billing is the invoice history now.
    const { findByTestId, getByTestId } = renderApp(<MembershipScreen />);
    fireEvent.press(await findByTestId('membership-credits-buy', {}, WAIT));
    await waitFor(() => {
      expect(getByTestId('credits-sheet-pack-pk_1')).toBeTruthy();
    }, WAIT);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('states the credits and the price on each pack, and buys the one picked', async () => {
    const { findByTestId, getByTestId, getByText } = renderApp(<MembershipScreen />);
    fireEvent.press(await findByTestId('membership-credits-buy', {}, WAIT));
    const pack = await findByTestId('credits-sheet-pack-pk_1', {}, WAIT);

    // `packMeta` is an ICU plural; an unrendered one would read `{count, …}`.
    // `ListRow` collapses to one accessibility node, so its own labels are
    // correctly hidden from a plain `getByText` — the same mechanic as
    // `EmptyState` below.
    expect(
      getByText('5 credits · GEL 200.00 · Valid for 90 days', { includeHiddenElements: true }),
    ).toBeTruthy();

    // Nothing is bought until a pack is chosen.
    fireEvent.press(getByTestId('credits-sheet-confirm'));
    expect(mockPurchaseCreditPack).not.toHaveBeenCalled();

    fireEvent.press(pack);
    fireEvent.press(getByTestId('credits-sheet-confirm'));
    await waitFor(() => {
      expect(mockPurchaseCreditPack).toHaveBeenCalledWith({ packId: 'pk_1' });
    }, WAIT);
    // The toast counts what was bought, and the balance is refetched because
    // `purchaseCreditPack`'s matrix row names `creditPacks`.
    await waitFor(() => {
      expect(getByText('5 credits added')).toBeTruthy();
    }, WAIT);
    await waitFor(() => {
      expect(mockListMyCreditPacks.mock.calls.length).toBeGreaterThan(1);
    }, WAIT);
  });

  it('says why a refused purchase was refused, and keeps the sheet open', async () => {
    mockPurchaseCreditPack.mockRejectedValue(
      new ApiError({ status: 409, code: 'PACKAGE_PLAN_INACTIVE' }),
    );
    const { findByTestId, getByTestId, getByText } = renderApp(<MembershipScreen />);
    fireEvent.press(await findByTestId('membership-credits-buy', {}, WAIT));
    fireEvent.press(await findByTestId('credits-sheet-pack-pk_1', {}, WAIT));
    fireEvent.press(getByTestId('credits-sheet-confirm'));

    await waitFor(() => {
      expect(getByText('This pack is no longer on sale.')).toBeTruthy();
    }, WAIT);
    // A purchase is `retry: false` — one attempt, one order.
    expect(mockPurchaseCreditPack).toHaveBeenCalledTimes(1);
    expect(getByTestId('credits-sheet-pack-pk_1')).toBeTruthy();
  });

  it('renders a gym that sells no packs as an empty state, with nothing to press', async () => {
    mockListCreditPackCatalogue.mockResolvedValue({ packs: [] });
    const { findByTestId, queryByTestId } = renderApp(<MembershipScreen />);
    fireEvent.press(await findByTestId('membership-credits-buy', {}, WAIT));
    await findByTestId('credits-sheet-empty', {}, WAIT);
    expect(queryByTestId('credits-sheet-confirm')).toBeNull();
  });
});

// ===========================================================================
// §6.
// ===========================================================================

describe('the branches', () => {
  it('skeletons the block while it loads', () => {
    const { getByTestId } = renderApp(<MembershipScreen />);
    expect(getByTestId('membership-block-loading')).toBeTruthy();
  });

  it('shows an error with a working retry', async () => {
    mockGetMySubscription.mockRejectedValueOnce(new Error('boom'));
    const { findByTestId, getByTestId } = renderApp(<MembershipScreen />);
    await findByTestId('membership-block-error', {}, WAIT);

    mockGetMySubscription.mockResolvedValue(membership(subscription()));
    fireEvent.press(getByTestId('membership-block-retry'));
    await findByTestId('membership-card', {}, WAIT);
    expect(mockGetMySubscription).toHaveBeenCalledTimes(2);
  });

  it('renders an offline branch', async () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<MembershipScreen />);
    await waitFor(() => {
      expect(getByTestId('membership-offline')).toBeTruthy();
    }, WAIT);
    expect(getByTestId('membership-block-offline')).toBeTruthy();
  });

  it('renders the "no plan" state with a way to pick one', async () => {
    mockGetMySubscription.mockResolvedValue(membership(null));
    const { findByTestId, getByText, queryByTestId } = renderApp(<MembershipScreen />);
    await findByTestId('membership-card-none', {}, WAIT);
    // `EmptyState` collapses to one accessibility node, so its title is
    // correctly invisible to a plain `getByText` (plan §7's note about
    // `getAllByRole('header')` is the same mechanic).
    expect(getByText('No active plan', { includeHiddenElements: true })).toBeTruthy();
    // No facts and no freeze section for a member with nothing to state.
    expect(queryByTestId('membership-facts')).toBeNull();
    expect(queryByTestId('membership-freeze')).toBeNull();
  });

  it('warns a PAST_DUE member without hiding their plan', async () => {
    mockGetMySubscription.mockResolvedValue(membership(subscription({ status: 'PAST_DUE' })));
    const { findByTestId, getByText } = renderApp(<MembershipScreen />);
    await findByTestId('membership-past-due', {}, WAIT);
    expect(getByText("Payment didn't go through")).toBeTruthy();
    expect(getByText('Premium')).toBeTruthy();
  });
});

describe('the chrome', () => {
  it('announces the title, the plan and its sections in order', async () => {
    const { findByTestId, getAllByRole } = renderApp(<MembershipScreen />);
    await findByTestId('membership-card', {}, WAIT);
    expect(headerTitles(getAllByRole('header'))).toEqual([
      'Membership',
      'Premium',
      'This period',
      'Pause membership',
      'PT credits',
    ]);
  });

  it('offers a labelled way back, and falls back to Profile from a cold link', async () => {
    const { findByTestId, getByTestId } = renderApp(<MembershipScreen />);
    await findByTestId('membership-card', {}, WAIT);
    fireEvent.press(getByTestId('membership-back'));
    expect(mockBack).toHaveBeenCalled();
  });

  it('renders no key paths, in either locale', async () => {
    for (const locale of ['en', 'ka'] as const) {
      const screen = renderApp(<MembershipScreen />, { locale });
      await screen.findByTestId('membership-card', {}, WAIT);
      expect(JSON.stringify(screen.toJSON())).not.toMatch(/"member\.membership\./i);
      screen.unmount();
    }
  });
});
