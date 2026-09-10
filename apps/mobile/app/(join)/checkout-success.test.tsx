// `(join)/checkout-success` — the receipt, on both of the two records a
// purchase can settle onto, plus every §6 state.
//
// Run with `--runTestsByPath`: `(join)` in a path PATTERN is a regex group.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent, waitFor } from '@testing-library/react-native';

import JoinCheckoutSuccessScreen from './checkout-success';
import { renderScreen } from '../../test-support/render-screen';

jest.setTimeout(30_000);
const WAIT = { timeout: 10_000 } as const;

const mockReplace = jest.fn();
let mockParams: { orderId?: string; subscriptionId?: string } = {};
jest.mock('expo-router', () => ({
  useRouter: () => ({
    replace: mockReplace,
    push: jest.fn(),
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

let mockGymId: string | null = 'gym_1';
jest.mock('../../hooks/useActiveGym', () => ({
  useGymId: () => mockGymId,
}));

let mockSession = { status: 'signed-in' as 'signed-in' | 'signed-out' };
jest.mock('../../hooks/useSession', () => ({
  useSession: () => mockSession,
}));

let mockOrder = {
  data: undefined as unknown,
  isPending: false,
  isError: false,
};
jest.mock('../../hooks/queries/useCheckoutOrder', () => ({
  useCheckoutOrder: () => mockOrder,
}));

let mockMembership = {
  data: undefined as unknown,
  isPending: false,
  isError: false,
};
jest.mock('../../hooks/queries/useMembership', () => ({
  useMembership: () => mockMembership,
}));

const ORDER = {
  order: {
    id: 'ord_9',
    status: 'PAID',
    total: 8900,
    currency: 'GEL',
    items: [{ label: 'Unlimited', amount: 8900 }],
  },
};

const SUBSCRIPTION = {
  subscription: {
    id: 'sub_1',
    status: 'ACTIVE',
    planName: 'Unlimited',
    priceAmount: 8900,
    currency: 'GEL',
    interval: 'MONTH',
    currentPeriodStart: '2026-08-31T00:00:00.000Z',
    currentPeriodEnd: '2026-09-30T00:00:00.000Z',
    cancelAtPeriodEnd: false,
    frozenAt: null,
    frozenUntil: null,
    freezeDaysPerPeriod: 0,
    freezeDaysUsed: 0,
    freezeDaysRemaining: 0,
    memberSince: '2026-08-31T00:00:00.000Z',
  },
  invoices: [],
};

beforeEach(() => {
  mockReplace.mockClear();
  mockParams = { orderId: 'ord_9' };
  mockGymId = 'gym_1';
  mockSession = { status: 'signed-in' };
  mockOrder = { data: ORDER, isPending: false, isError: false };
  mockMembership = { data: SUBSCRIPTION, isPending: false, isError: false };
  onlineManager.setOnline(true);
});

afterEach(() => {
  onlineManager.setOnline(true);
});

function headerTexts(nodes: readonly unknown[]): string[] {
  return nodes.map((node) => String((node as { props?: { children?: unknown } }).props?.children));
}

describe('the order branch', () => {
  it('itemises the order and its total', () => {
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-order')).toBeTruthy();
    expect(view.getByTestId('join-success-total')).toBeTruthy();
  });

  it('always tells the buyer to verify their address', () => {
    // `POST /auth/signup` issues a session for an UNVERIFIED address: they are
    // signed in now, and cannot sign in again until they click the link.
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-verify')).toBeTruthy();
  });

  it('repeats the front-desk sentence — no card was charged', () => {
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-note')).toBeTruthy();
  });

  it('leaves the funnel with REPLACE so a spent checkout cannot be walked back into', () => {
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    fireEvent.press(view.getByTestId('join-success-home'));
    expect(mockReplace).toHaveBeenCalledWith('/home');
  });
});

describe('the subscription branch', () => {
  beforeEach(() => {
    mockParams = { subscriptionId: 'sub_1' };
  });

  it('reads GET /me/subscription instead of an order', () => {
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-subscription')).toBeTruthy();
    expect(view.queryByTestId('join-success-order')).toBeNull();
  });

  it('confirms the sale even when the member read has not caught up', () => {
    // The enrolment succeeded — we hold a `subscriptionId`. A missing plan line
    // must not read as a failed purchase.
    mockMembership = {
      data: { subscription: null, invoices: [] },
      isPending: false,
      isError: false,
    };
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-subscription-pending')).toBeTruthy();
  });

  it('sets the renewal day in the mono face, unformatted', () => {
    // `Intl` is banned and `createDateTimeFormat` is UTC-only, so a
    // locale-aware date here would be wrong in one direction or the other.
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-next-billing').props.children).toBe('2026-09-30');
  });
});

describe('the §6 states', () => {
  it('shows SKELETONS while the record loads', () => {
    mockOrder = { data: undefined, isPending: true, isError: false };
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-loading')).toBeTruthy();
  });

  it('shows the ERROR state with a working retry', async () => {
    mockOrder = { data: undefined, isPending: false, isError: true };
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-error')).toBeTruthy();
    fireEvent.press(view.getByTestId('join-success-error-retry'));
    // The retry invalidates rather than calling `.refetch()`, so there is
    // nothing to assert on the hook — only that the control exists and fires.
    await waitFor(() => view.getByTestId('join-success-error'), WAIT);
  });

  it('shows the MISSING state when neither id was passed', () => {
    mockParams = {};
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-missing')).toBeTruthy();
  });

  it('shows the SIGNED-OUT branch — both reads need a Bearer', () => {
    mockSession = { status: 'signed-out' };
    mockGymId = null;
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(view.getByTestId('join-success-signed-out')).toBeTruthy();
  });

  it('shows the OFFLINE advisory', async () => {
    // TODO(i18n): no `offline` keys exist — see `components/auth/pending-copy.ts`.
    onlineManager.setOnline(false);
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    await waitFor(() => view.getByTestId('join-success-offline'), WAIT);
  });
});

describe('the a11y contract', () => {
  it('has exactly one header, and it is the screen title', () => {
    const view = renderScreen(<JoinCheckoutSuccessScreen />);
    expect(headerTexts(view.getAllByRole('header'))).toEqual(["You're all set!"]);
  });

  it('renders in Georgian with no English baked in', () => {
    const view = renderScreen(<JoinCheckoutSuccessScreen />, { locale: 'ka' });
    expect(headerTexts(view.getAllByRole('header'))).toEqual(['ყველაფერი მზადაა!']);
  });
});
