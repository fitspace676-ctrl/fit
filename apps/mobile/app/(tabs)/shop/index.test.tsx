// Shop — every branch of plan §6, and the two rules the artboard hides.
//
// The placeholder this replaces asserted that the tab had a destination. What
// is asserted here instead: the loading / empty / no-match / error-with-a-
// working-retry / offline / no-tenant states, that the retry is an
// INVALIDATION and not a `.refetch()`, that add-to-cart is not optimistic, and
// that the 0 → 1 trailing-control swap happens on the row rather than inside
// `QtyStepper`.
//
// The query and mutation hooks are mocked rather than the network, for the
// reason §5 gives: these are render tests of the a11y contract and
// the state machine, not of `lib/api`, which has its own Vitest suite on the
// other side of §5's boundary.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent } from '@testing-library/react-native';

import ShopScreen from './index';
import { renderApp } from '../../../test-support/render';

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
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: jest.fn(),
    canGoBack: () => true,
  }),
}));

let mockSession = {
  status: 'signed-in' as 'hydrating' | 'signed-out' | 'signed-in',
  userId: 'usr_1' as string | null,
  gymId: 'gym_1' as string | null,
  role: 'MEMBER' as string | null,
  expiresAt: null as number | null,
};
jest.mock('../../../hooks/useSession', () => ({
  useSession: () => mockSession,
  useIsSignedIn: () => mockSession.status === 'signed-in',
}));

let mockGymId: string | null = 'gym_1';
jest.mock('../../../hooks/useActiveGym', () => ({
  useGymId: () => mockGymId,
  useActiveGym: () =>
    mockGymId === null ? null : { gymId: mockGymId, role: 'MEMBER', userId: 'usr_1' },
}));

// The tenant a PUBLIC screen reads. Separate from the session on purpose: this
// screen browses signed out, so `gymId` here can be set while `mockGymId` — the
// access-token claim, which still scopes the CART — is null. The seam itself is
// tested in `hooks/useDiscoveryGym.spec.ts` / `.test.tsx`.
const mockGymRetry = jest.fn();
let mockGym = {
  gymId: 'gym_1' as string | null,
  isPending: false,
  isError: false,
  retry: mockGymRetry,
};
jest.mock('../../../hooks/useDiscoveryGym', () => ({
  useDiscoveryGym: () => mockGym,
}));

interface Query {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  error?: unknown;
}

let mockProducts: Query = { data: undefined, isPending: true, isError: false };
jest.mock('../../../hooks/queries/useShop', () => ({
  useProducts: () => mockProducts,
  useLocations: () => ({ data: { locations: [] }, isPending: false, isError: false }),
}));

/** The shape the screen reads off a cart line. Widened by hand because
 *  `{ items: [] }` infers `never[]`, and a test that cannot add a line to its
 *  own fixture is a test that only ever exercises the empty branch. */
interface Line {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string | null;
  imageUrl: string | null;
  unitPrice: number;
  qty: number;
  lineTotal: number;
  currency: string;
  available: boolean;
}
interface Cart {
  items: Line[];
  subtotal: number;
  discount: number;
  total: number;
  currency: string;
}

const EMPTY_CART: Cart = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' };
let mockCart: Cart = EMPTY_CART;
/**
 * `GET /cart` failed.
 *
 * The screen must be able to tell a FAILED cart from an EMPTY one — with the
 * two collapsed, the badge vanishes and every row's stepper reverts to "+".
 */
let mockCartFailed = false;
jest.mock('../../../hooks/queries/useCart', () => ({
  useCartOrEmpty: () => ({
    cart: mockCart,
    query: { data: mockCart, isPending: false, isError: mockCartFailed },
  }),
  useCart: () => ({ data: mockCart, isPending: false, isError: mockCartFailed }),
}));

/**
 * `GET /me/orders`, as an infinite query.
 *
 * Mocked at the hook rather than the network, like every other query on this
 * screen: `lib/api/orders.ts` has its own Vitest suite on the other side of §5's
 * boundary, and what a screen test owes is the state machine and the a11y
 * contract.
 */
interface OrdersQuery {
  data?: { pages: { orders: unknown[]; total: number; page: number; limit: number }[] };
  isPending: boolean;
  isError: boolean;
  hasNextPage: boolean;
  isFetchingNextPage: boolean;
  fetchNextPage: () => void;
}

const ORD_1 = {
  id: 'ord_1',
  status: 'paid' as const,
  total: 4500,
  currency: 'GEL',
  itemCount: 4,
  itemLabels: ['Whey Protein', 'Shaker'],
  createdAt: '2026-06-01T10:00:00.000Z',
};
const ORD_2 = {
  id: 'ord_2',
  status: 'pending' as const,
  total: 2500,
  currency: 'GEL',
  itemCount: 1,
  itemLabels: ['Insulated Shaker Bottle'],
  createdAt: '2026-05-20T09:00:00.000Z',
};

const mockFetchNextPage = jest.fn();
let mockOrders: OrdersQuery = {
  data: { pages: [{ orders: [ORD_1, ORD_2], total: 2, page: 1, limit: 20 }] },
  isPending: false,
  isError: false,
  hasNextPage: false,
  isFetchingNextPage: false,
  fetchNextPage: mockFetchNextPage,
};
jest.mock('../../../hooks/queries/useOrders', () => ({
  MY_ORDERS_PAGE_SIZE: 20,
  useMyOrders: () => mockOrders,
}));

const mockAdd = jest.fn();
const mockUpdate = jest.fn(() => Promise.resolve(undefined));
const mockRemove = jest.fn(() => Promise.resolve(undefined));
let mockAddPending = false;
let mockAddVariables: { variantId: string } | undefined;
jest.mock('../../../hooks/mutations/useCartMutations', () => ({
  useAddCartItem: () => ({
    mutate: mockAdd,
    isPending: mockAddPending,
    variables: mockAddVariables,
  }),
  useUpdateCartItem: () => ({ mutateAsync: mockUpdate }),
  useRemoveCartItem: () => ({ mutateAsync: mockRemove }),
}));

/** `mock`-prefixed so the hoisted factory below may close over it. */
const mockInvalidate = jest.fn();
jest.mock('@tanstack/react-query', () => {
  const actual: object = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({ invalidateQueries: mockInvalidate, setQueryData: jest.fn() }),
  };
});

/** One product, no variants — the shop's simplest row, and a `:base` line. */
const SHAKER = {
  id: 'p_shaker',
  name: 'Insulated Shaker Bottle',
  description: 'Keeps it cold',
  priceAmount: 2500,
  currency: 'GEL',
  imageUrl: null,
  variants: [],
};

/** Two variants — the row whose "+" must OPEN the detail, never add. */
const TEE = {
  id: 'p_tee',
  name: 'Branded Training Tee',
  description: 'Cotton',
  priceAmount: 4500,
  currency: 'GEL',
  imageUrl: null,
  variants: [
    { id: '0', name: 'S', priceAmount: 4500, available: true },
    { id: '1', name: 'M', priceAmount: 5000, available: true },
  ],
};

beforeEach(() => {
  jest.clearAllMocks();
  onlineManager.setOnline(true);
  mockSession = {
    status: 'signed-in',
    userId: 'usr_1',
    gymId: 'gym_1',
    role: 'MEMBER',
    expiresAt: null,
  };
  mockGymId = 'gym_1';
  mockGym = { gymId: 'gym_1', isPending: false, isError: false, retry: mockGymRetry };
  mockProducts = { data: { products: [SHAKER, TEE] }, isPending: false, isError: false };
  mockCart = EMPTY_CART;
  mockCartFailed = false;
  mockAddPending = false;
  mockAddVariables = undefined;
  mockOrders = {
    data: { pages: [{ orders: [ORD_1, ORD_2], total: 2, page: 1, limit: 20 }] },
    isPending: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: mockFetchNextPage,
  };
});

afterAll(() => {
  onlineManager.setOnline(true);
});

describe('the frame', () => {
  it('mounts with exactly one header, from the catalogue', () => {
    const { getByTestId, getAllByRole } = renderApp(<ShopScreen />);
    expect(getByTestId('shop-screen')).toBeTruthy();
    expect(getAllByRole('header').map(headerText)).toEqual(['Shop']);
  });

  it('renders no raw dot-paths in Georgian', () => {
    const ka = renderApp(<ShopScreen />, { locale: 'ka' });
    expect(ka.queryByText('Shop')).toBeNull();
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/member\.shop\./);
  });

  it('reads member.shop, never the top-level shop (D10)', () => {
    // `member.shop.title` is "Shop" and `shop.subtitle` is "Gear, supplements,
    // and essentials from your gym." — the top-level family's line, which this
    // screen must never render.
    const { queryByText, getByText } = renderApp(<ShopScreen />);
    expect(getByText('Fuel & gear')).toBeTruthy();
    expect(queryByText('Gear, supplements, and essentials from your gym.')).toBeNull();
  });
});

describe('§6 states', () => {
  it('shows skeletons while loading, announced once', () => {
    mockProducts = { data: undefined, isPending: true, isError: false };
    const { getByTestId, getByLabelText } = renderApp(<ShopScreen />);
    expect(getByTestId('shop-loading')).toBeTruthy();
    expect(getByLabelText('Loading products…')).toBeTruthy();
  });

  it('shows the empty state when the gym sells nothing', () => {
    mockProducts = { data: { products: [] }, isPending: false, isError: false };
    const { getByTestId, getByText } = renderApp(<ShopScreen />);
    expect(getByTestId('shop-empty')).toBeTruthy();
    expect(getByText('Nothing for sale yet')).toBeTruthy();
  });

  it('shows an error with a retry that INVALIDATES rather than refetches', () => {
    mockProducts = { data: undefined, isPending: false, isError: true };
    const { getByTestId, getByText } = renderApp(<ShopScreen />);
    expect(getByText('We couldn’t load the shop. Please try again.')).toBeTruthy();

    fireEvent.press(getByTestId('shop-error-retry'));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['products', 'gym_1', null] });
  });

  it('raises the offline advisory when the radio is down', () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<ShopScreen />);
    // TODO(i18n): there are no `offline` keys in either catalogue, so this
    // branch is structural and its sentence is English — see
    // `components/auth/pending-copy.ts`.
    expect(getByTestId('shop-offline')).toBeTruthy();
  });

  it('LISTS THE CATALOGUE SIGNED OUT, and gates only the write', () => {
    // The decision this screen used to make the other way. `GET /products` is
    // `@Public()` and takes `gymId` as a query param, `/classes`, `/trainers`
    // and `/services` all serve discovery signed out, and D9's line is between
    // browsing and WRITING — the cart is Bearer-scoped on this platform, the
    // listing is not.
    mockSession = { ...mockSession, status: 'signed-out', gymId: null };
    mockGymId = null;

    const { getByTestId, queryByTestId } = renderApp(<ShopScreen />);

    expect(getByTestId(`shop-product-${SHAKER.id}`)).toBeTruthy();
    expect(queryByTestId('shop-no-gym')).toBeNull();

    // …and the write is still gated.
    fireEvent.press(getByTestId(`shop-product-${SHAKER.id}-add`));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fshop');
  });

  it('HOLDS the write while the keychain is still being read', () => {
    // `hydrating` is not `signed-out`: `SignInGate.prompt` deliberately swallows
    // the press for that frame rather than bouncing a returning member to
    // /login on a guess.
    mockSession = { ...mockSession, status: 'hydrating', gymId: null };
    mockGymId = null;

    const { getByTestId } = renderApp(<ShopScreen />);
    fireEvent.press(getByTestId(`shop-product-${SHAKER.id}-add`));

    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('skeletons while the TENANT is still being resolved', () => {
    mockGym = { gymId: null, isPending: true, isError: false, retry: mockGymRetry };
    const { getByTestId, queryByTestId } = renderApp(<ShopScreen />);
    expect(getByTestId('shop-loading')).toBeTruthy();
    expect(queryByTestId('shop-no-gym')).toBeNull();
  });

  it('shows a failed load with a WORKING retry when no tenant resolves at all', () => {
    // Not a sign-in prompt: signing in would not fix a build with no gym slug,
    // and offering to would be a dead button.
    mockGym = { gymId: null, isPending: false, isError: true, retry: mockGymRetry };

    const { getByTestId, queryByTestId } = renderApp(<ShopScreen />);
    expect(getByTestId('shop-no-gym')).toBeTruthy();
    expect(queryByTestId(`shop-product-${SHAKER.id}`)).toBeNull();

    fireEvent.press(getByTestId('shop-no-gym-retry'));
    expect(mockGymRetry).toHaveBeenCalled();
  });
});

describe('search', () => {
  it('filters client-side and offers a way back', () => {
    const { getByTestId, queryByTestId, getByText } = renderApp(<ShopScreen />);
    fireEvent.changeText(getByTestId('shop-search-input'), 'shaker');
    expect(getByTestId(`shop-product-${SHAKER.id}`)).toBeTruthy();
    expect(queryByTestId(`shop-product-${TEE.id}`)).toBeNull();

    fireEvent.changeText(getByTestId('shop-search-input'), 'zzz');
    expect(getByText('No products match')).toBeTruthy();
    fireEvent.press(getByTestId('shop-no-match-clear'));
    expect(getByTestId(`shop-product-${TEE.id}`)).toBeTruthy();
  });
});

describe('a cart that would not load', () => {
  it('SAYS SO, rather than rendering a failure as an empty cart', () => {
    // `useCartOrEmpty` hands back an empty cart so the badge can draw on the
    // first frame. With `GET /cart` failed that empty value is a claim: the
    // badge disappears (member reads "cart is empty"), every stepper reverts to
    // "+", and pressing one POSTs a second line for something already in there.
    mockCartFailed = true;
    const { getByTestId } = renderApp(<ShopScreen />);
    // TODO(i18n) `member.shop.cart.loadError` — the English placeholder.
    expect(getByTestId('shop-cart-error')).toBeTruthy();
  });

  it('says nothing when the cart merely IS empty', () => {
    const { queryByTestId } = renderApp(<ShopScreen />);
    expect(queryByTestId('shop-cart-error')).toBeNull();
  });
});

describe('the trailing control', () => {
  it('is an add button at qty 0 and a stepper above it', () => {
    const { getByTestId, queryByTestId, rerender } = renderApp(<ShopScreen />);
    expect(getByTestId(`shop-product-${SHAKER.id}-add`)).toBeTruthy();
    expect(queryByTestId(`shop-product-${SHAKER.id}-stepper`)).toBeNull();

    mockCart = {
      ...EMPTY_CART,
      items: [
        {
          variantId: 'p_shaker:base',
          productId: SHAKER.id,
          productName: SHAKER.name,
          variantName: null,
          imageUrl: null,
          unitPrice: 2500,
          qty: 2,
          lineTotal: 5000,
          currency: 'GEL',
          available: true,
        },
      ],
      subtotal: 5000,
      total: 5000,
    };
    rerender(<ShopScreen />);
    expect(getByTestId(`shop-product-${SHAKER.id}-stepper`)).toBeTruthy();
    expect(queryByTestId(`shop-product-${SHAKER.id}-add`)).toBeNull();
  });

  it('adds the `:base` reference, and shows a spinner rather than a fabricated line', () => {
    const { getByTestId, rerender } = renderApp(<ShopScreen />);
    fireEvent.press(getByTestId(`shop-product-${SHAKER.id}-add`));
    expect(mockAdd).toHaveBeenCalledWith({ variantId: 'p_shaker:base', qty: 1 }, expect.anything());

    mockAddPending = true;
    mockAddVariables = { variantId: 'p_shaker:base' };
    rerender(<ShopScreen />);
    expect(getByTestId(`shop-product-${SHAKER.id}-adding`)).toBeTruthy();
  });

  it('opens the detail for a 2+ variant product instead of guessing an option', () => {
    const { getByTestId } = renderApp(<ShopScreen />);
    fireEvent.press(getByTestId(`shop-product-${TEE.id}-add`));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/shop/product/p_tee');
  });

  it('removes with a DELETE, never a qty:0 PATCH', () => {
    mockCart = {
      ...EMPTY_CART,
      items: [
        {
          variantId: 'p_shaker:base',
          productId: SHAKER.id,
          productName: SHAKER.name,
          variantName: null,
          imageUrl: null,
          unitPrice: 2500,
          qty: 1,
          lineTotal: 2500,
          currency: 'GEL',
          available: true,
        },
      ],
      subtotal: 2500,
      total: 2500,
    };
    const { getByTestId } = renderApp(<ShopScreen />);
    fireEvent.press(getByTestId(`shop-product-${SHAKER.id}-stepper-decrease`));
    expect(mockRemove).toHaveBeenCalledWith({ variantId: 'p_shaker:base' });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('prompts sign-in from the "+" rather than posting a cart nobody can read (D9)', () => {
    mockSession = { ...mockSession, status: 'signed-out' };
    const { getByTestId } = renderApp(<ShopScreen />);
    fireEvent.press(getByTestId(`shop-product-${SHAKER.id}-add`));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fshop');
  });
});

describe('the two tabs', () => {
  /** Move to the Orders tab. `Segmented` names each option `${testID}-${value}`. */
  function openOrders(api: { getByTestId: (id: string) => unknown }): void {
    fireEvent.press(api.getByTestId('shop-tabs-orders') as never);
  }

  it('opens on the catalogue, with the history one press away', () => {
    const api = renderApp(<ShopScreen />);
    expect(api.getByTestId(`shop-product-${SHAKER.id}`)).toBeTruthy();
    expect(api.queryByTestId('shop-orders-list')).toBeNull();

    openOrders(api);

    expect(api.getByTestId('shop-orders-list')).toBeTruthy();
    // The catalogue is unmounted, not merely scrolled past — the search box and
    // the perk belong to the tab that is off.
    expect(api.queryByTestId(`shop-product-${SHAKER.id}`)).toBeNull();
    expect(api.queryByTestId('shop-search')).toBeNull();
  });

  it('keeps the search text when the member checks an order and comes back', () => {
    // Deliberately NOT the `key={tab}` remount `/classes` uses: a cleared search
    // box is work the member did and lost.
    const api = renderApp(<ShopScreen />);
    fireEvent.changeText(api.getByTestId('shop-search-input'), 'shaker');
    openOrders(api);
    fireEvent.press(api.getByTestId('shop-tabs-products'));

    expect(api.queryByTestId(`shop-product-${TEE.id}`)).toBeNull();
    expect(api.getByTestId(`shop-product-${SHAKER.id}`)).toBeTruthy();
  });

  it('leaves the mini cart on the catalogue, where the cart belongs', () => {
    mockCart = {
      ...EMPTY_CART,
      items: [
        {
          variantId: 'p_shaker:base',
          productId: SHAKER.id,
          productName: SHAKER.name,
          variantName: null,
          imageUrl: null,
          unitPrice: 2500,
          qty: 1,
          lineTotal: 2500,
          currency: 'GEL',
          available: true,
        },
      ],
      subtotal: 2500,
      total: 2500,
    };
    const api = renderApp(<ShopScreen />);
    expect(api.getByTestId('shop-mini-cart')).toBeTruthy();

    openOrders(api);
    // Under a list of orders already placed, "view cart" pulls the member off
    // the tab they just chose.
    expect(api.queryByTestId('shop-mini-cart')).toBeNull();
  });
});

describe('the orders tab', () => {
  function renderOrders() {
    const api = renderApp(<ShopScreen />);
    fireEvent.press(api.getByTestId('shop-tabs-orders'));
    return api;
  }

  it('lists an order by total, date and state, and opens the detail it links into', () => {
    const api = renderOrders();

    expect(api.getByTestId('shop-order-ord_1')).toBeTruthy();
    // ONE accessibility node per row, so the pill is spoken as part of it or
    // not at all — and the total in its `spoken` form, because a monospace
    // "GEL 45.00" is read digit by digit. The status vocabulary is the ORDER
    // SCREEN's, so the list cannot name a state differently from the detail one
    // tap away.
    expect(api.getByLabelText('45 GEL, Jun 1, 2026, Paid')).toBeTruthy();
    expect(api.getByLabelText('25 GEL, May 20, 2026, Pending')).toBeTruthy();
    // `itemLabels` carries two lines; the rest is counted, never named. Hidden
    // from the reader (it is inside the row's node), so it is queried as such.
    expect(
      api.getByText(/Whey Protein, Shaker \+2 more/, { includeHiddenElements: true }),
    ).toBeTruthy();

    fireEvent.press(api.getByTestId('shop-order-ord_1'));
    expect(mockPush).toHaveBeenCalledWith('/shop/order/ord_1');
  });

  it('shows skeletons while the history loads, announced once', () => {
    mockOrders = { ...mockOrders, data: undefined, isPending: true };
    const api = renderOrders();
    expect(api.getByTestId('shop-orders-loading')).toBeTruthy();
    expect(api.getByLabelText('Loading your orders…')).toBeTruthy();
  });

  it('shows an error whose retry INVALIDATES the history key', () => {
    mockOrders = { ...mockOrders, data: undefined, isPending: false, isError: true };
    const api = renderOrders();
    expect(api.getByText('We couldn’t load your orders. Please try again.')).toBeTruthy();

    fireEvent.press(api.getByTestId('shop-orders-error-retry'));
    expect(mockInvalidate).toHaveBeenCalledWith({
      queryKey: ['myOrders', 'gym_1', { limit: 20 }],
    });
  });

  it('sends an empty history back to the catalogue TAB, not to a push', () => {
    mockOrders = {
      ...mockOrders,
      data: { pages: [{ orders: [], total: 0, page: 1, limit: 20 }] },
    };
    const api = renderOrders();
    expect(api.getByText('No orders yet')).toBeTruthy();

    fireEvent.press(api.getByTestId('shop-orders-browse'));
    expect(api.getByTestId(`shop-product-${SHAKER.id}`)).toBeTruthy();
    // `/shop` is the route the member is already standing on.
    expect(mockPush).not.toHaveBeenCalledWith('/shop');
  });

  it('offers another page only while the server says there is one', () => {
    const api = renderOrders();
    expect(api.queryByTestId('shop-orders-load-more')).toBeNull();

    mockOrders = { ...mockOrders, hasNextPage: true };
    api.rerender(<ShopScreen />);
    fireEvent.press(api.getByTestId('shop-tabs-orders'));
    fireEvent.press(api.getByTestId('shop-orders-load-more'));
    expect(mockFetchNextPage).toHaveBeenCalled();
  });

  it('PROMPTS SIGN-IN rather than claiming a stranger has bought nothing', () => {
    // The asymmetry between the two tabs, and the reason for it: the catalogue
    // takes an explicit `gymId` and browses signed out; `GET /me/orders`
    // resolves the member from the session and has no id on the wire.
    mockSession = { ...mockSession, status: 'signed-out', gymId: null };
    mockGymId = null;

    const api = renderOrders();
    expect(api.queryByTestId('shop-orders-list')).toBeNull();
    expect(api.queryByTestId('shop-orders-empty')).toBeNull();
    expect(api.getByTestId('shop-orders-signed-out')).toBeTruthy();

    fireEvent.press(api.getByTestId('shop-orders-sign-in'));
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fshop');
  });
});

describe('the mini cart', () => {
  it('is absent on an empty cart and present once there is a line', () => {
    const { queryByTestId, getByTestId, rerender } = renderApp(<ShopScreen />);
    expect(queryByTestId('shop-mini-cart')).toBeNull();

    mockCart = {
      ...EMPTY_CART,
      items: [
        {
          variantId: 'p_shaker:base',
          productId: SHAKER.id,
          productName: SHAKER.name,
          variantName: null,
          imageUrl: null,
          unitPrice: 2500,
          qty: 3,
          lineTotal: 7500,
          currency: 'GEL',
          available: true,
        },
      ],
      subtotal: 7500,
      total: 7500,
    };
    rerender(<ShopScreen />);
    fireEvent.press(getByTestId('shop-mini-cart'));
    expect(mockPush).toHaveBeenCalledWith('/shop/cart');
  });
});
