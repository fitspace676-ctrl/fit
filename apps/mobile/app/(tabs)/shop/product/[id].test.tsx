// Product detail — the variant chooser, and the branch that has no endpoint.
//
// The two things worth pinning here beyond §6's states:
//
//   1. THE VARIANT REFERENCE. `ProductVariantSummary.id` is a stringified
//      INDEX, and the cart wants `encodeVariantRef(productId, index)` — i.e.
//      `"p_tee:1"`, never `"1"` and never `"p_tee:M"`. That translation is the
//      single most silently-wrong thing on this screen: a wrong reference does
//      not throw, it adds the wrong thing.
//
//   2. THERE IS NO `GET /products/:id`. The screen reads the LISTING and finds
//      its row, so "not found" is "not in the list", not a 404.
import { onlineManager } from '@tanstack/react-query';
import { fireEvent } from '@testing-library/react-native';

import ProductScreen from './[id]';
import { renderApp } from '../../../../test-support/render';
import { paintsOpaquely } from '../../../../test-support/style';

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

/**
 * The sticky bar's line total, as a screen reader hears it.
 *
 * The figure is tabular mono and split across an eyebrow and a `Money`, so the
 * one node that carries the whole claim is the grouping `View`'s
 * `accessibilityLabel` — which is also the only string here that does not
 * depend on how `Intl` happens to place the currency symbol.
 */
function spokenTotal(node: unknown): string {
  return String((node as { props?: { accessibilityLabel?: unknown } }).props?.accessibilityLabel);
}

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockParams: Record<string, string> = { id: 'p_tee' };
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

// The PUBLIC tenant — separate from the session, which still scopes the cart.
const mockGymRetry = jest.fn();
let mockGym = {
  gymId: 'gym_1' as string | null,
  isPending: false,
  isError: false,
  retry: mockGymRetry,
};
jest.mock('../../../../hooks/useDiscoveryGym', () => ({
  useDiscoveryGym: () => mockGym,
}));

const TEE = {
  id: 'p_tee',
  name: 'Branded Training Tee',
  description: 'Heavyweight cotton',
  priceAmount: 4500,
  currency: 'GEL',
  imageUrl: null,
  variants: [
    { id: '0', name: 'S', priceAmount: 4500, available: true },
    { id: '1', name: 'M', priceAmount: 5000, available: true },
    { id: '2', name: 'L', priceAmount: 5000, available: false },
  ],
};

const SHAKER = {
  id: 'p_shaker',
  name: 'Insulated Shaker Bottle',
  description: '',
  priceAmount: 2500,
  currency: 'GEL',
  imageUrl: null,
  variants: [],
};

const SOLD_OUT = {
  ...TEE,
  id: 'p_gone',
  name: 'Discontinued Hoodie',
  variants: [{ id: '0', name: 'One size', priceAmount: 9900, available: false }],
};

interface Query {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  /** `'paused'` is `onlineManager` HOLDING the request rather than failing it. */
  fetchStatus?: 'fetching' | 'paused' | 'idle';
}

let mockProducts: Query = {
  data: { products: [TEE, SHAKER, SOLD_OUT] },
  isPending: false,
  isError: false,
};
jest.mock('../../../../hooks/queries/useShop', () => ({
  useProducts: () => mockProducts,
  useLocations: () => ({ data: { locations: [] }, isPending: false, isError: false }),
}));

const EMPTY_CART = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' };
/** `GET /cart` failed — a box, because `jest.mock` factories may not close over
 *  a plain `let` that is not `mock`-prefixed at definition time. */
const mockCartFailedRef = { current: false };
jest.mock('../../../../hooks/queries/useCart', () => ({
  useCartOrEmpty: () => ({
    cart: EMPTY_CART,
    query: { data: EMPTY_CART, isPending: false, isError: mockCartFailedRef.current },
  }),
  useCart: () => ({
    data: EMPTY_CART,
    isPending: false,
    isError: mockCartFailedRef.current,
  }),
}));

const mockAdd = jest.fn();
let mockAddPending = false;
jest.mock('../../../../hooks/mutations/useCartMutations', () => ({
  useAddCartItem: () => ({ mutate: mockAdd, isPending: mockAddPending, variables: undefined }),
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
  mockCartFailedRef.current = false;
  mockParams = { id: 'p_tee' };
  mockSession = {
    status: 'signed-in',
    userId: 'usr_1',
    gymId: 'gym_1',
    role: 'MEMBER',
    expiresAt: null,
  };
  mockGymId = 'gym_1';
  mockGym = { gymId: 'gym_1', isPending: false, isError: false, retry: mockGymRetry };
  mockProducts = { data: { products: [TEE, SHAKER, SOLD_OUT] }, isPending: false, isError: false };
  mockAddPending = false;
});

afterAll(() => {
  onlineManager.setOnline(true);
});

describe('the frame', () => {
  it('titles itself with the product and lists its sections as headers', () => {
    const { getByTestId, getAllByRole } = renderApp(<ProductScreen />);
    expect(getByTestId('product-screen')).toBeTruthy();
    expect(getAllByRole('header').map(headerText)).toEqual([
      'Branded Training Tee',
      'About',
      'Options',
      'Quantity',
    ]);
  });

  it('drops the Options header for a product with no variants', () => {
    mockParams = { id: 'p_shaker' };
    const { getAllByRole } = renderApp(<ProductScreen />);
    // …and the About header too: `SHAKER.description` is empty.
    expect(getAllByRole('header').map(headerText)).toEqual(['Insulated Shaker Bottle', 'Quantity']);
  });

  // ==========================================================================
  // THE NAME IS THE HERO'S `h1`, AND THE APP BAR NO LONGER REPEATS IT.
  //
  // It used to be BOTH: the app-bar title at 28px extrabold, where "Branded
  // Training Tee" wrapped to two lines and "E2E Water Bottle…" was cut, and
  // again in the hero at 16px body copy — the same string twice, neither of
  // them the size a hero wants. The detail artboard's app bar carries two
  // round controls and no title, so the name is the hero's, at 34px, and it
  // is the screen's first `role="header"` rather than a second one.
  // ==========================================================================
  it('names the product ONCE, in the hero, as the screen h1', () => {
    const { getByTestId, getAllByText, getAllByRole } = renderApp(<ProductScreen />);
    expect(getByTestId('product-name')).toHaveTextContent('Branded Training Tee');
    expect(getAllByText('Branded Training Tee')).toHaveLength(1);
    expect(getAllByRole('header').map(headerText)[0]).toBe('Branded Training Tee');
  });

  // The app bar has no title once the product is known — but a screen that is
  // still loading, or that failed, has no hero to carry one, and a screen with
  // no header at all gives the rotor nothing to land on.
  it('keeps a header while there is no product yet', () => {
    mockProducts = { data: undefined, isPending: true, isError: false };
    const { getAllByRole } = renderApp(<ProductScreen />);
    expect(getAllByRole('header').map(headerText)).toEqual(['Shop']);
  });

  it('renders no raw dot-paths in Georgian', () => {
    const ka = renderApp(<ProductScreen />, { locale: 'ka' });
    expect(ka.queryByText('Options')).toBeNull();
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/member\.shop\./);
  });
});

describe('§6 states', () => {
  it('shows skeletons while the listing loads', () => {
    mockProducts = { data: undefined, isPending: true, isError: false };
    const { getByTestId } = renderApp(<ProductScreen />);
    expect(getByTestId('product-loading')).toBeTruthy();
  });

  it('shows an error with a retry that invalidates the products key', () => {
    mockProducts = { data: undefined, isPending: false, isError: true };
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-error-retry'));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['products', 'gym_1', null] });
  });

  it('shows "not found" for an id that is not in the listing', () => {
    mockParams = { id: 'p_nope' };
    const { getByTestId, getByText } = renderApp(<ProductScreen />);
    expect(getByText('Product not found')).toBeTruthy();
    fireEvent.press(getByTestId('product-not-found-back'));
    expect(mockReplace).toHaveBeenCalledWith('/shop');
  });

  it('shows "not found" for a route with no id at all', () => {
    mockParams = {};
    const { getByText } = renderApp(<ProductScreen />);
    expect(getByText('Product not found')).toBeTruthy();
  });

  it('raises the offline advisory and refuses the add', () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<ProductScreen />);
    expect(getByTestId('product-offline')).toBeTruthy();
    fireEvent.press(getByTestId('product-variant-1'));
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('COLD WITH NO RADIO, says so instead of skeletoning for the session', () => {
    // A paused query is `isPending` forever, so `if (products.isPending)` drew
    // a placeholder that never becomes a product and never explains itself.
    // TODO(i18n) `common.offline.title` / `common.offline.body`.
    onlineManager.setOnline(false);
    mockProducts = { data: undefined, isPending: true, isError: false, fetchStatus: 'paused' };
    const { getByTestId, getByText, queryByTestId } = renderApp(<ProductScreen />);

    expect(getByTestId('product-offline')).toBeTruthy();
    expect(getByText("You're offline")).toBeTruthy();
    expect(queryByTestId('product-loading')).toBeNull();
  });

  it('still skeletons while a request is genuinely in flight', () => {
    mockProducts = { data: undefined, isPending: true, isError: false, fetchStatus: 'fetching' };
    const { getByTestId, queryByTestId } = renderApp(<ProductScreen />);
    expect(getByTestId('product-loading')).toBeTruthy();
    expect(queryByTestId('product-offline')).toBeNull();
  });

  it('RENDERS THE PRODUCT SIGNED OUT, and gates only the add', () => {
    // Same decision as the listing next door: browsing is public, writing is
    // not. `GET /products` takes `gymId` as a query param precisely for this.
    mockSession = { ...mockSession, status: 'signed-out', gymId: null };
    mockGymId = null;

    const { getByTestId, queryByTestId } = renderApp(<ProductScreen />);
    expect(getByTestId('product-screen')).toBeTruthy();
    expect(queryByTestId('product-no-gym')).toBeNull();

    fireEvent.press(getByTestId('product-variant-1'));
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fshop%2Fproduct%2Fp_tee');
  });

  it('skeletons while the tenant is still being resolved', () => {
    mockGym = { gymId: null, isPending: true, isError: false, retry: mockGymRetry };
    const { getByTestId } = renderApp(<ProductScreen />);
    expect(getByTestId('product-loading')).toBeTruthy();
  });

  it('shows a failed load with a working retry when no tenant resolves', () => {
    mockGym = { gymId: null, isPending: false, isError: true, retry: mockGymRetry };
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-no-gym-retry'));
    expect(mockGymRetry).toHaveBeenCalled();
  });
});

describe('the variant chooser', () => {
  it('will not add until an option is chosen', () => {
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('SAYS WHY the CTA is dead, rather than swallowing the press in silence', () => {
    // A disabled `Button` swallows its own press, so it can never explain
    // itself: the member presses "Add to cart", nothing happens, and no
    // sentence anywhere says an option is still owed. One screen away the cart
    // does this right (`branchOwed` → `member.cart.pickLocation`), and this is
    // the same shape with `member.shop.detail.options`.
    const { getByTestId, queryByTestId } = renderApp(<ProductScreen />);
    expect(getByTestId('product-option-required')).toBeTruthy();

    fireEvent.press(getByTestId('product-variant-0'));
    expect(queryByTestId('product-option-required')).toBeNull();
  });

  it('does not ask for an option on a product that has none', () => {
    mockParams = { id: 'p_shaker' };
    const { queryByTestId } = renderApp(<ProductScreen />);
    expect(queryByTestId('product-option-required')).toBeNull();
  });

  it('does not ask for an option on a wholly sold-out product', () => {
    // Picking a size does not un-sell it, so "choose an option" would be an
    // instruction that leads nowhere.
    mockParams = { id: 'p_gone' };
    const { queryByTestId } = renderApp(<ProductScreen />);
    expect(queryByTestId('product-option-required')).toBeNull();
  });

  it('SAYS SO when the cart would not load — the bag badge is not evidence', () => {
    mockCartFailedRef.current = true;
    const { getByTestId } = renderApp(<ProductScreen />);
    // TODO(i18n) `member.shop.cart.loadError`.
    expect(getByTestId('product-cart-error')).toBeTruthy();
  });

  it('sends `<productId>:<index>`, not the variant name and not the bare index', () => {
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-variant-1'));
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).toHaveBeenCalledWith({ variantId: 'p_tee:1', qty: 1 }, expect.anything());
  });

  it('sends the `:base` reference for a product sold as-is', () => {
    mockParams = { id: 'p_shaker' };
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).toHaveBeenCalledWith({ variantId: 'p_shaker:base', qty: 1 }, expect.anything());
  });

  it('carries the chosen quantity, capped by the stepper rather than by the server', () => {
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-variant-0'));
    fireEvent.press(getByTestId('product-qty-increase'));
    fireEvent.press(getByTestId('product-qty-increase'));
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).toHaveBeenCalledWith({ variantId: 'p_tee:0', qty: 3 }, expect.anything());
  });

  it('lists an unavailable option rather than hiding it, and will not add it', () => {
    const { getByTestId } = renderApp(<ProductScreen />);
    // The API projects out-of-stock variants deliberately, "so the buyer sees
    // what exists rather than a silently shorter list".
    expect(getByTestId('product-variant-2')).toBeTruthy();
    fireEvent.press(getByTestId('product-variant-2'));
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('flags a wholly sold-out product and disables the CTA', () => {
    mockParams = { id: 'p_gone' };
    const { getByTestId } = renderApp(<ProductScreen />);
    expect(getByTestId('product-sold-out')).toBeTruthy();
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).not.toHaveBeenCalled();
  });

  it('prompts sign-in from the CTA rather than posting an unreadable cart (D9)', () => {
    mockSession = { ...mockSession, status: 'signed-out' };
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-variant-0'));
    fireEvent.press(getByTestId('product-add'));
    expect(mockAdd).not.toHaveBeenCalled();
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fshop%2Fproduct%2Fp_tee');
  });
});

describe('the sticky footer', () => {
  // The same latent bug the cart shipped visibly — see `ScreenProps.footer`.
  it('paints an opaque plate', () => {
    const { getByTestId } = renderApp(<ProductScreen />);
    expect(paintsOpaquely(getByTestId('product-footer-plate'))).toBe(true);
  });

  // The artboard's bar is a FACT and a button, never a lone button — and the
  // fact is whatever the press is about to commit to.
  it('carries a line total that follows the stepper', () => {
    const { getByTestId } = renderApp(<ProductScreen />);
    fireEvent.press(getByTestId('product-variant-1'));
    const one = spokenTotal(getByTestId('product-total'));
    fireEvent.press(getByTestId('product-qty-increase'));
    expect(spokenTotal(getByTestId('product-total'))).not.toEqual(one);
  });

  it('QUOTES the total while the price still depends on an unchosen option', () => {
    // `lowestPrice` is the cheapest variant (S, 45.00) and M is 50.00, so a
    // flat "Total 45.00" understates the member who then picks M.
    const { getByTestId } = renderApp(<ProductScreen />);
    expect(spokenTotal(getByTestId('product-total'))).toContain('from ');
    fireEvent.press(getByTestId('product-variant-1'));
    expect(spokenTotal(getByTestId('product-total'))).not.toContain('from ');
  });

  it('states the total flat for a product that has one price', () => {
    mockParams = { id: 'p_shaker' };
    const { getByTestId } = renderApp(<ProductScreen />);
    expect(spokenTotal(getByTestId('product-total'))).not.toContain('from ');
  });
});
