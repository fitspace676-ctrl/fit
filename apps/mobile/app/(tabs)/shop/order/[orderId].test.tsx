// Order confirmation — the screen the deleted app could never have rendered.
//
// It read `GET /orders/:orderId`, which is `BillingRead` and 403s for a member,
// after a `POST /orders` that does not exist. The endpoint contract is asserted
// by `scripts/check-mobile-endpoints.ts` against the API's own AST; what is
// asserted HERE is everything that check cannot see — that the screen branches
// on the read, that a 404 is "not your order" rather than a retryable failure,
// and that the confirmation announces the order id as one sentence rather than
// spelling it out as a monospace run.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent } from '@testing-library/react-native';

import OrderScreen from './[orderId]';
import { ApiError } from '../../../../lib/http/api-error';
import { renderApp } from '../../../../test-support/render';

/**
 * The text a `role="header"` node carries.
 *
 * RNTL types a host node's `props` as `any`, so reaching into it is an unsafe
 * member access the shared lint config (correctly) refuses. Narrowed once here,
 * the way the other screen tests do — §6 as amended asks for the ORDERED LIST of
 * headers, and `UNSAFE_root.findAll` is not the way to get it (it walks
 * composite instances and counts one `Heading` three times).
 */
function headerText(node: unknown): unknown {
  return (node as { props?: { children?: unknown } }).props?.children;
}

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { orderId: 'ord_1' };
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
  useLocalSearchParams: () => mockParams,
}));

let mockSession = {
  status: 'signed-in' as 'hydrating' | 'signed-out' | 'signed-in',
  userId: 'usr_1' as string | null,
  gymId: 'gym_1' as string | null,
  role: 'MEMBER' as string | null,
  expiresAt: null as number | null,
};
jest.mock('../../../../hooks/useSession', () => ({
  useSession: () => mockSession,
  useIsSignedIn: () => mockSession.status === 'signed-in',
}));

let mockGymId: string | null = 'gym_1';
jest.mock('../../../../hooks/useActiveGym', () => ({
  useGymId: () => mockGymId,
  useActiveGym: () =>
    mockGymId === null ? null : { gymId: mockGymId, role: 'MEMBER', userId: 'usr_1' },
}));

const ORDER = {
  id: 'ord_1',
  status: 'paid' as 'pending' | 'paid' | 'cancelled',
  total: 11400,
  currency: 'GEL',
  items: [
    { label: 'Whey Protein 1kg', amount: 8900 },
    { label: 'Insulated Shaker Bottle', amount: 2500 },
  ],
};

interface Query {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
}

let mockOrder: Query = { data: { order: ORDER }, isPending: false, isError: false };
jest.mock('../../../../hooks/queries/useCheckoutOrder', () => ({
  useCheckoutOrder: () => mockOrder,
}));

const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => {
  const actual: object = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidate, setQueryData: jest.fn() }),
  };
});

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  mockParams = { orderId: 'ord_1' };
  mockSession = {
    status: 'signed-in',
    userId: 'usr_1',
    gymId: 'gym_1',
    role: 'MEMBER',
    expiresAt: null,
  };
  mockGymId = 'gym_1';
  mockOrder = { data: { order: ORDER }, isPending: false, isError: false };
});

afterAll(() => {
  onlineManager.setOnline(true);
});

describe('the confirmation', () => {
  it('mounts with the ordered header list', () => {
    mockParams = { orderId: 'ord_1', placed: '1' };
    const { getByTestId, getAllByRole } = renderApp(<OrderScreen />);
    expect(getByTestId('order-screen')).toBeTruthy();
    expect(getAllByRole('header').map(headerText)).toEqual(['Order placed']);
  });

  it('reads member.shop.order, not the top-level shop.order (D10)', () => {
    // `shop.order.title` is "Order confirmed"; `member.shop.order.title` is
    // "Order placed". Only one of them may appear.
    mockParams = { orderId: 'ord_1', placed: '1' };
    const { getByText, queryByText } = renderApp(<OrderScreen />);
    expect(getByText('Order placed')).toBeTruthy();
    expect(queryByText('Order confirmed')).toBeNull();
  });

  // ==========================================================================
  // TWO ARRIVALS, ONE SCREEN. Checkout `replace`s here with `?placed=1`; the
  // orders tab pushes the same route without it, and so does
  // `fit://orders/:id`. "Order placed", and the subtitle promising to say when
  // it is ready, are about the ARRIVAL — reading a week-old order under them
  // restates a finished event as news and makes a promise twice.
  // ==========================================================================
  it('drops the announcement when the order is opened from history', () => {
    const { getAllByRole, queryByText, queryByTestId } = renderApp(<OrderScreen />);
    expect(getAllByRole('header').map(headerText)).toEqual(['Order']);
    expect(queryByText('Order placed')).toBeNull();
    expect(queryByTestId('order-subtitle')).toBeNull();
    // The order itself still renders in full — only the announcement went.
    expect(queryByTestId('order-status')).toBeTruthy();
  });

  it('keeps the announcement on the checkout arrival', () => {
    mockParams = { orderId: 'ord_1', placed: '1' };
    const { getByTestId, getByText } = renderApp(<OrderScreen />);
    expect(getByText('Order placed')).toBeTruthy();
    expect(getByTestId('order-subtitle')).toBeTruthy();
  });

  it('announces the id as one sentence, not as a spelled-out mono run', () => {
    const { getByLabelText } = renderApp(<OrderScreen />);
    expect(getByLabelText('Order, ord_1')).toBeTruthy();
  });

  it('itemises the order and totals it, each row one spoken sentence', () => {
    const { getAllByTestId, getByLabelText } = renderApp(<OrderScreen />);
    expect(getAllByTestId('order-item')).toHaveLength(2);
    // Grouped: the label and the figure are ONE node, and the figure is spoken
    // as a quantity ("114 GEL") rather than as a monospace run
    // ("one one four full stop zero zero"). Which is also why the digits
    // themselves are not reachable by `getByText` — they are hidden from the
    // reader on purpose.
    expect(getByLabelText('Whey Protein 1kg, 89 GEL')).toBeTruthy();
    expect(getByLabelText('Total, 114 GEL')).toBeTruthy();
  });

  it('shows the status from the catalogue, per lifecycle state', () => {
    const { getByText, rerender } = renderApp(<OrderScreen />);
    expect(getByText('Paid')).toBeTruthy();

    mockOrder = {
      data: { order: { ...ORDER, status: 'pending' } },
      isPending: false,
      isError: false,
    };
    rerender(<OrderScreen />);
    expect(getByText('Pending')).toBeTruthy();

    mockOrder = {
      data: { order: { ...ORDER, status: 'cancelled' } },
      isPending: false,
      isError: false,
    };
    rerender(<OrderScreen />);
    expect(getByText('Cancelled')).toBeTruthy();
  });

  it('sends the member back to the shop, replacing rather than pushing', () => {
    const { getByTestId } = renderApp(<OrderScreen />);
    fireEvent.press(getByTestId('order-continue'));
    expect(mockReplace).toHaveBeenCalledWith('/shop');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders no raw dot-paths in Georgian', () => {
    mockParams = { orderId: 'ord_1', placed: '1' };
    const ka = renderApp(<OrderScreen />, { locale: 'ka' });
    expect(ka.queryByText('Order placed')).toBeNull();
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/member\.shop\./);
  });
});

describe('§6 states', () => {
  it('shows skeletons while the order loads', () => {
    mockOrder = { data: undefined, isPending: true, isError: false };
    const { getByTestId } = renderApp(<OrderScreen />);
    expect(getByTestId('order-loading')).toBeTruthy();
  });

  it('shows an error with a retry that invalidates the order key', () => {
    mockOrder = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError({ status: 500, message: 'boom' }),
    };
    const { getByTestId } = renderApp(<OrderScreen />);
    expect(getByTestId('order-error')).toBeTruthy();
    fireEvent.press(getByTestId('order-error-retry'));
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ['checkoutOrder', 'gym_1', 'ord_1'],
    });
  });

  it('treats a 404 as "not your order" — no retry, because retrying is a lie', () => {
    mockOrder = {
      data: undefined,
      isPending: false,
      isError: true,
      error: new ApiError({ status: 404, message: 'not found' }),
    };
    const { getByTestId, queryByTestId, getByText } = renderApp(<OrderScreen />);
    expect(getByTestId('order-not-found')).toBeTruthy();
    expect(getByText('Order not found')).toBeTruthy();
    expect(queryByTestId('order-error-retry')).toBeNull();
  });

  it('shows "not found" for a route with no order id', () => {
    mockParams = {};
    const { getByTestId } = renderApp(<OrderScreen />);
    expect(getByTestId('order-not-found')).toBeTruthy();
  });

  it('raises the offline advisory', () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<OrderScreen />);
    expect(getByTestId('order-offline')).toBeTruthy();
  });

  it('gates itself signed out, because the prefix rule makes the route public', () => {
    // `ROUTE_POLICY` says `order: 'auth'`, but `policyFor` matches longest
    // prefix and `'(tabs)/shop'` is `'public'`, so no redirect fires here.
    mockSession = { ...mockSession, status: 'signed-out', gymId: null };
    mockGymId = null;
    const { getByTestId } = renderApp(<OrderScreen />);
    expect(getByTestId('order-signed-out')).toBeTruthy();
    fireEvent.press(getByTestId('order-sign-in'));
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fshop%2Forder%2Ford_1');
  });
});
