// Cart — the §6 branches, and THE TWO CHECKOUT FAILURES THAT ARE NOT ERRORS.
//
// The 409 and the 422 are the reason this file is long. `POST /cart/checkout`
// hand-sets both statuses so `newPrices` / `removedItems` survive the exception
// filter, `checkoutCart` RESOLVES with a discriminated outcome rather than
// throwing, and neither branch may auto-retry — the 409 because the server has
// already re-priced (so a silent retry charges an unseen price) and the 422
// because the total just fell.
//
// The deleted app's Maestro shop flow was green while calling a route that does
// not exist, because it asserted that the UI moved to a confirmation screen.
// These assert the REQUEST: which body went out, and how many times.
import { onlineManager } from '@tanstack/react-query';
import { act, fireEvent } from '@testing-library/react-native';

import CartScreen, { resolveBranch } from './cart';
import { renderApp } from '../../../test-support/render';
import { flatStyle, paintsOpaquely } from '../../../test-support/style';

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
const mockBack = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    back: mockBack,
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

interface Query {
  data?: unknown;
  isPending: boolean;
  isError: boolean;
  /** `'paused'` is `onlineManager` HOLDING the request rather than failing it. */
  fetchStatus?: 'fetching' | 'paused' | 'idle';
}

const LINE = {
  variantId: 'p_whey:0',
  productId: 'p_whey',
  productName: 'Whey Protein 1kg',
  variantName: 'Vanilla',
  imageUrl: null,
  unitPrice: 8900,
  qty: 1,
  lineTotal: 8900,
  currency: 'GEL',
  available: true,
};

const FULL_CART = {
  items: [LINE],
  subtotal: 8900,
  discount: 0,
  total: 8900,
  currency: 'GEL',
};

const EMPTY_CART = { items: [], subtotal: 0, discount: 0, total: 0, currency: 'GEL' };

let mockCartQuery: Query = { data: FULL_CART, isPending: false, isError: false };
jest.mock('../../../hooks/queries/useCart', () => ({
  useCart: () => mockCartQuery,
  useCartOrEmpty: () => ({ cart: mockCartQuery.data ?? EMPTY_CART, query: mockCartQuery }),
}));

const DOWNTOWN = {
  id: 'loc_1',
  name: 'Downtown',
  address: '1 Rustaveli Ave',
  photoUrl: null,
  amenities: [],
  hours: {},
};
const RIVERSIDE = { ...DOWNTOWN, id: 'loc_2', name: 'Riverside' };

let mockLocations: Query = {
  data: { locations: [DOWNTOWN, RIVERSIDE] },
  isPending: false,
  isError: false,
};
jest.mock('../../../hooks/queries/useShop', () => ({
  useLocations: () => mockLocations,
  useProducts: () => ({ data: { products: [] }, isPending: false, isError: false }),
}));

const mockUpdate = jest.fn(() => Promise.resolve(undefined));
const mockRemove = jest.fn(() => Promise.resolve(undefined));
jest.mock('../../../hooks/mutations/useCartMutations', () => ({
  useUpdateCartItem: () => ({ mutateAsync: mockUpdate }),
  useRemoveCartItem: () => ({ mutateAsync: mockRemove }),
}));

/**
 * The checkout mutation, driven by hand.
 *
 * `mutate(input, { onSuccess, onError })` is captured so a test can decide,
 * per press, whether the server answered `201`, `409 PRICE_CHANGED`,
 * `422 OUT_OF_STOCK` or a real throw — which is exactly the four-way branch the
 * screen exists to get right.
 */
let mockOutcome: unknown = { ok: true, orderId: 'ord_1' };
let mockThrows = false;
let mockCheckoutPending = false;
const mockCheckout = jest.fn(
  (
    _input: unknown,
    handlers?: { onSuccess?: (outcome: unknown) => void; onError?: (error: unknown) => void },
  ) => {
    if (mockThrows) handlers?.onError?.(new Error('boom'));
    else handlers?.onSuccess?.(mockOutcome);
  },
);
jest.mock('../../../hooks/mutations/useCheckoutMutations', () => ({
  useCheckoutCart: () => ({ mutate: mockCheckout, isPending: mockCheckoutPending }),
}));

const mockInvalidate = jest.fn();
const mockSetQueryData = jest.fn();
jest.mock('@tanstack/react-query', () => {
  const actual: object = jest.requireActual('@tanstack/react-query');
  return {
    ...actual,
    useQueryClient: () => ({
      invalidateQueries: mockInvalidate,
      setQueryData: mockSetQueryData,
    }),
  };
});

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
  mockCartQuery = { data: FULL_CART, isPending: false, isError: false };
  mockLocations = { data: { locations: [DOWNTOWN, RIVERSIDE] }, isPending: false, isError: false };
  mockOutcome = { ok: true, orderId: 'ord_1' };
  mockThrows = false;
  mockCheckoutPending = false;
});

afterAll(() => {
  onlineManager.setOnline(true);
});

describe('the frame', () => {
  it('mounts with the ordered header list the sections imply', () => {
    const { getByTestId, getAllByRole } = renderApp(<CartScreen />);
    expect(getByTestId('cart-screen')).toBeTruthy();
    expect(getAllByRole('header').map(headerText)).toEqual([
      'Your cart',
      'Front-desk pickup',
      'Order summary',
    ]);
  });

  it('renders no raw dot-paths in Georgian', () => {
    const ka = renderApp(<CartScreen />, { locale: 'ka' });
    expect(ka.queryByText('Your cart')).toBeNull();
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/member\.(shop|cart)\./);
  });
});

describe('§6 states', () => {
  it('shows line-shaped skeletons while the cart loads', () => {
    mockCartQuery = { data: undefined, isPending: true, isError: false };
    const { getByTestId } = renderApp(<CartScreen />);
    expect(getByTestId('cart-loading')).toBeTruthy();
  });

  it('shows an error with a retry that invalidates the cart key', () => {
    mockCartQuery = { data: undefined, isPending: false, isError: true };
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-error-retry'));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['cart', 'gym_1'] });
  });

  it('shows the empty state, with a way back to the shop', () => {
    mockCartQuery = { data: EMPTY_CART, isPending: false, isError: false };
    const { getByTestId, getByText } = renderApp(<CartScreen />);
    expect(getByText('Your cart is empty')).toBeTruthy();
    fireEvent.press(getByTestId('cart-browse'));
    expect(mockReplace).toHaveBeenCalledWith('/shop');
  });

  it('raises the offline advisory and disables the CTA', () => {
    onlineManager.setOnline(false);
    const { getByTestId } = renderApp(<CartScreen />);
    expect(getByTestId('cart-offline')).toBeTruthy();
    fireEvent.press(getByTestId('cart-place-order'));
    expect(mockCheckout).not.toHaveBeenCalled();
  });

  it('COLD WITH NO RADIO, says so instead of skeletoning for the session', () => {
    // `onlineManager` PAUSES a query rather than failing it: `isPending` stays
    // true, `isError` never becomes true, and the branch below it — a plain
    // `if (cartQuery.isPending)` — drew skeletons that could never resolve.
    // On the one screen in the app that takes money.
    // `app/(tabs)/classes/index.tsx` models the test: paused + nothing cached.
    // TODO(i18n) `common.offline.title` / `common.offline.body`.
    onlineManager.setOnline(false);
    mockCartQuery = { data: undefined, isPending: true, isError: false, fetchStatus: 'paused' };
    const { getByTestId, getByText, queryByTestId } = renderApp(<CartScreen />);

    expect(getByTestId('cart-offline')).toBeTruthy();
    expect(getByText("You're offline")).toBeTruthy();
    expect(queryByTestId('cart-loading')).toBeNull();
  });

  it('still skeletons while a request is genuinely in flight', () => {
    mockCartQuery = { data: undefined, isPending: true, isError: false, fetchStatus: 'fetching' };
    const { getByTestId, queryByTestId } = renderApp(<CartScreen />);
    expect(getByTestId('cart-loading')).toBeTruthy();
    expect(queryByTestId('cart-offline')).toBeNull();
  });

  it('prompts sign-in with no gym in scope — the cart is Bearer-scoped (D9)', () => {
    mockSession = { ...mockSession, status: 'signed-out', gymId: null };
    mockGymId = null;
    const { getByTestId } = renderApp(<CartScreen />);
    expect(getByTestId('cart-signed-out')).toBeTruthy();
    fireEvent.press(getByTestId('cart-signed-out-action'));
    expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fshop%2Fcart');
  });

  it('surfaces a failed load of the pickup locations, retryable on its own', () => {
    mockLocations = { data: undefined, isPending: false, isError: true };
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-locations-error-retry'));
    expect(mockInvalidate).toHaveBeenCalledWith({ queryKey: ['locations', 'gym_1'] });
  });
});

describe('the lines', () => {
  it('steps a quantity with an absolute PATCH', () => {
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-line-p_whey:0-stepper-increase'));
    expect(mockUpdate).toHaveBeenCalledWith({ variantId: 'p_whey:0', qty: 2 });
  });

  it('removes with a DELETE from the bin AND from the stepper at 1', () => {
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-line-p_whey:0-remove'));
    fireEvent.press(getByTestId('cart-line-p_whey:0-stepper-decrease'));
    expect(mockRemove).toHaveBeenCalledTimes(2);
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('still draws an unavailable line, flagged rather than hidden', () => {
    mockCartQuery = {
      data: { ...FULL_CART, items: [{ ...LINE, available: false }] },
      isPending: false,
      isError: false,
    };
    const { getByText } = renderApp(<CartScreen />);
    expect(getByText('Whey Protein 1kg')).toBeTruthy();
    expect(getByText('Out of stock')).toBeTruthy();
  });
});

describe('the totals', () => {
  it('says the discount is applied at checkout rather than showing one', () => {
    // `CartView.discount` is always 0 — the promo travels in the checkout body.
    // TODO(i18n) `member.shop.cart.promoAtCheckout`.
    const { getByTestId, queryByText } = renderApp(<CartScreen />);
    expect(getByTestId('cart-promo-note')).toBeTruthy();
    expect(queryByText('Discount')).toBeNull();
    // Subtotal and total are the same number, because nothing has discounted it.
    expect(getByTestId('cart-subtotal')).toBeTruthy();
    expect(getByTestId('cart-total')).toBeTruthy();
  });
});

describe('checkout', () => {
  it('will not fire until a pickup location is chosen', () => {
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-place-order'));
    expect(mockCheckout).not.toHaveBeenCalled();

    fireEvent.press(getByTestId('cart-location-loc_2'));
    fireEvent.press(getByTestId('cart-place-order'));
    expect(mockCheckout).toHaveBeenCalledWith(
      { fulfillment: 'PICKUP', locationId: 'loc_2', promoCode: undefined },
      expect.anything(),
    );
  });

  it('auto-selects a lone branch — one option is not a choice', () => {
    mockLocations = { data: { locations: [DOWNTOWN] }, isPending: false, isError: false };
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-place-order'));
    expect(mockCheckout).toHaveBeenCalledWith(
      { fulfillment: 'PICKUP', locationId: 'loc_1', promoCode: undefined },
      expect.anything(),
    );
  });

  it('sends the promo code in the checkout BODY, not in cart state', () => {
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.changeText(getByTestId('cart-promo-input'), '  SUMMER10  ');
    fireEvent.press(getByTestId('cart-place-order'));
    expect(mockCheckout).toHaveBeenCalledWith(
      { fulfillment: 'PICKUP', locationId: 'loc_1', promoCode: 'SUMMER10' },
      expect.anything(),
    );
  });

  it('on 201 empties the cached cart and REPLACES to the order screen', () => {
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.press(getByTestId('cart-place-order'));

    expect(mockSetQueryData).toHaveBeenCalledWith(['cart', 'gym_1'], {
      items: [],
      subtotal: 0,
      discount: 0,
      total: 0,
      currency: 'GEL',
    });
    // `replace`: the cart the member just emptied is not a screen to go back to.
    // `placed=1` marks this as the arrival that may say "Order placed" — the
    // orders tab opens the same route without it.
    expect(mockReplace).toHaveBeenCalledWith('/shop/order/ord_1?placed=1');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('renders a real error for a genuine throw, and does not navigate', () => {
    mockThrows = true;
    const { getByTestId, queryByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.press(getByTestId('cart-place-order'));
    expect(getByTestId('cart-checkout-error')).toBeTruthy();
    expect(queryByTestId('cart-price-changed')).toBeNull();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// THE ORDER'S BRANCH.
//
// `locationId` is what attributes the sale to a site — per-branch revenue, and
// which shelf it draws down. An order placed without one is missing from every
// per-branch figure, so the interesting assertions here are the two REFUSALS:
// the screen must not post a branch the gym no longer offers, and it must not
// invent one when it cannot know. There is no home branch to fall back on —
// the access token carries no `locationId` and `GET /me/profile` is
// `{userId, name, email, phone}`.
// ===========================================================================

describe('resolveBranch', () => {
  it('holds the choice while the branch is still on offer', () => {
    expect(resolveBranch([DOWNTOWN, RIVERSIDE], 'loc_2')).toBe('loc_2');
  });

  it('drops a choice the gym has withdrawn rather than posting a dead id', () => {
    // The list is a query. A branch deactivated between the tap and the press
    // vanishes from it while the id lives on in state; held as plain state that
    // id stays "selected" with no chip drawn and the CTA still live.
    expect(resolveBranch([DOWNTOWN, RIVERSIDE], 'loc_9')).toBeNull();
  });

  it('resolves a lone branch, chosen or not — one option is not a choice', () => {
    expect(resolveBranch([DOWNTOWN], null)).toBe('loc_1');
    expect(resolveBranch([DOWNTOWN], 'loc_9')).toBe('loc_1');
  });

  it('refuses rather than guessing at the head of the list', () => {
    expect(resolveBranch([DOWNTOWN, RIVERSIDE], null)).toBeNull();
    expect(resolveBranch([], null)).toBeNull();
    expect(resolveBranch(undefined, 'loc_1')).toBeNull();
  });
});

describe('the order gets a branch, or it does not get placed', () => {
  it('says WHY the CTA is dead, and stops saying it once a branch is picked', () => {
    // A disabled button that explains nothing is the same failure as a wrong
    // branch, one step earlier: press, nothing happens, no sentence anywhere
    // says a pickup point is still owed.
    const { getByTestId, queryByTestId } = renderApp(<CartScreen />);
    expect(getByTestId('cart-pickup-required')).toBeTruthy();

    fireEvent.press(getByTestId('cart-location-loc_2'));
    expect(queryByTestId('cart-pickup-required')).toBeNull();
  });

  it('asks for nothing on a single-branch gym — no pointless extra tap', () => {
    mockLocations = { data: { locations: [DOWNTOWN] }, isPending: false, isError: false };
    const { getByTestId, queryByTestId } = renderApp(<CartScreen />);
    expect(queryByTestId('cart-pickup-required')).toBeNull();
    // Still DRAWN, and drawn as selected: the member is told which desk rather
    // than merely charged.
    expect(getByTestId('cart-location-loc_1')).toBeTruthy();
  });

  it('goes BUSY, never DISABLED, the instant the money button is pressed', () => {
    // The rule, stated verbatim at `app/(join)/checkout.tsx`: "`busy` is NOT
    // `disabled`: a primary that greys out the instant it is pressed reads as a
    // rejection." `Button.busy` already swallows the press AND reports
    // `{busy: true, disabled: false}`; folding `isPending` into `disabled`
    // bought nothing and made VoiceOver say "dimmed" at the moment of payment.
    mockCheckoutPending = true;
    mockLocations = { data: { locations: [DOWNTOWN] }, isPending: false, isError: false };
    const { getByTestId } = renderApp(<CartScreen />);
    const cta = getByTestId('cart-place-order');
    expect(cta.props.accessibilityState).toMatchObject({ busy: true, disabled: false });
  });

  it('will not check out with a branch the gym has withdrawn', () => {
    mockLocations = {
      data: { locations: [DOWNTOWN, RIVERSIDE, { ...DOWNTOWN, id: 'loc_3', name: 'Vake' }] },
      isPending: false,
      isError: false,
    };
    const { getByTestId, queryByTestId, rerender } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_3'));

    // Vake is deactivated; the locations query refetches without it.
    mockLocations = {
      data: { locations: [DOWNTOWN, RIVERSIDE] },
      isPending: false,
      isError: false,
    };
    rerender(<CartScreen />);

    expect(queryByTestId('cart-location-loc_3')).toBeNull();
    fireEvent.press(getByTestId('cart-place-order'));
    expect(mockCheckout).not.toHaveBeenCalled();
    expect(getByTestId('cart-pickup-required')).toBeTruthy();
  });

  it('says there is no front desk rather than asking for one that does not exist', () => {
    mockLocations = { data: { locations: [] }, isPending: false, isError: false };
    const { getByTestId, getByText, queryByTestId } = renderApp(<CartScreen />);

    expect(getByTestId('cart-no-locations')).toBeTruthy();
    expect(getByText('No locations available')).toBeTruthy();
    // NOT "choose a pickup location" — there is nothing to choose.
    expect(queryByTestId('cart-pickup-required')).toBeNull();

    fireEvent.press(getByTestId('cart-place-order'));
    expect(mockCheckout).not.toHaveBeenCalled();
  });

  it('leaves the branch copy translated in Georgian', () => {
    const ka = renderApp(<CartScreen />, { locale: 'ka' });
    expect(ka.getByTestId('cart-pickup-required')).toBeTruthy();
    expect(JSON.stringify(ka.toJSON())).not.toMatch(/member\.cart\.|checkout\.locations\./);
  });
});

describe('409 PRICE_CHANGED — a failure that is not an error', () => {
  beforeEach(() => {
    mockOutcome = {
      ok: false,
      reason: 'PRICE_CHANGED',
      newPrices: [{ variantId: 'p_whey:0', priceAmount: 9500 }],
    };
  });

  it('opens a sheet showing old against new, and NEVER auto-retries', () => {
    const { getByTestId, getByText } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.press(getByTestId('cart-place-order'));

    expect(getByTestId('cart-price-changed')).toBeTruthy();
    expect(getByText('Prices changed - review your cart')).toBeTruthy();
    // The OLD price comes from the pre-press snapshot: the mutation invalidates
    // the cart on a 409, so the cache is already moving to the new one.
    // TODO(i18n) `member.shop.cart.priceWas`.
    expect(getByText('was GEL 89.00')).toBeTruthy();
    expect(getByText('GEL 95.00')).toBeTruthy();

    // ONE request. A second would charge a price the member has not seen.
    expect(mockCheckout).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('re-fires the IDENTICAL checkout only from the confirm press', () => {
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.press(getByTestId('cart-place-order'));

    mockOutcome = { ok: true, orderId: 'ord_2' };
    fireEvent.press(getByTestId('cart-price-changed-confirm'));

    expect(mockCheckout).toHaveBeenCalledTimes(2);
    expect(mockCheckout.mock.calls[1]?.[0]).toEqual(mockCheckout.mock.calls[0]?.[0]);
    expect(mockReplace).toHaveBeenCalledWith('/shop/order/ord_2?placed=1');
  });

  it('puts a RETRY FAILURE inside the sheet, not underneath it', () => {
    // `Sheet` is a native `Modal`, so `cart-checkout-error` — which lives in
    // the scroll body — is drawn UNDERNEATH the panel. Without a copy inside,
    // the member confirms the new prices, the request fails, and the only thing
    // that says so is behind the sheet: a re-enabled button and no explanation,
    // on the one screen that takes money.
    const { getByTestId } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.press(getByTestId('cart-place-order'));
    expect(getByTestId('cart-price-changed')).toBeTruthy();

    mockThrows = true;
    fireEvent.press(getByTestId('cart-price-changed-confirm'));

    expect(getByTestId('cart-price-changed-failed')).toBeTruthy();
    // Still open, so the failure is beside the button that caused it.
    expect(getByTestId('cart-price-changed')).toBeTruthy();
  });

  it('closes without buying when the member backs out', () => {
    // FAKE TIMERS, NOT `waitFor`. `Sheet` keeps its `Modal` mounted through the
    // EXIT ANIMATION by design (WP-8b) and unmounts on a `setTimeout`, so the
    // panel is still in the tree for one more frame. Polling for its removal
    // makes the assertion a race against a real clock under a loaded runner —
    // which is exactly how it passed alone and failed in the full suite.
    //
    // `jest.useFakeTimers()` is safe here ONLY because `jest.config.js` sets
    // `doNotFake: ['setImmediate','clearImmediate']`; read that file's header
    // before removing this comment.
    jest.useFakeTimers();
    try {
      const { getByTestId, queryByTestId } = renderApp(<CartScreen />);
      fireEvent.press(getByTestId('cart-location-loc_1'));
      fireEvent.press(getByTestId('cart-place-order'));
      fireEvent.press(getByTestId('cart-price-changed-cancel'));

      // What must be true IMMEDIATELY is that nothing was bought.
      expect(mockCheckout).toHaveBeenCalledTimes(1);

      act(() => {
        jest.advanceTimersByTime(1000);
      });
      expect(queryByTestId('cart-price-changed')).toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('422 OUT_OF_STOCK — the other failure that is not an error', () => {
  beforeEach(() => {
    mockOutcome = { ok: false, reason: 'OUT_OF_STOCK', removedItems: ['p_whey:0'] };
  });

  it('names what the server already removed, and does not retry', () => {
    const { getByTestId, getByText } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.press(getByTestId('cart-place-order'));

    expect(getByTestId('cart-out-of-stock')).toBeTruthy();
    expect(getByText('Out of stock')).toBeTruthy();
    // The name comes from the snapshot — the line is gone from the cart by now.
    // TODO(i18n) `member.shop.cart.outOfStockBody`.
    expect(
      getByText(/These items sold out and were removed from your cart\. Whey Protein 1kg/),
    ).toBeTruthy();

    expect(mockCheckout).toHaveBeenCalledTimes(1);
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('still names the dropped line once the cart has emptied underneath it', () => {
    const { getByTestId, rerender } = renderApp(<CartScreen />);
    fireEvent.press(getByTestId('cart-location-loc_1'));
    fireEvent.press(getByTestId('cart-place-order'));

    // The invalidation lands: the server removed the only line.
    mockCartQuery = { data: EMPTY_CART, isPending: false, isError: false };
    rerender(<CartScreen />);
    expect(getByTestId('cart-out-of-stock')).toBeTruthy();
    expect(getByTestId('cart-empty')).toBeTruthy();
  });
});

describe('the sticky footer', () => {
  // THE DEFECT: `Screen` positions its footer ABSOLUTELY over the scroll view
  // and paints nothing of its own (the rule now lives on `ScreenProps.footer`).
  // A bare `View` here drew "1 in basket" and "Choose a pickup location" glyph
  // on glyph at the default scroll position, and the reassurance line bled
  // through the button band. Nothing about that is visible to a text query —
  // every node is still mounted — so the assertion is on the fill.
  it('paints an opaque plate so the cart does not draw through it', () => {
    const { getByTestId } = renderApp(<CartScreen />);
    expect(paintsOpaquely(getByTestId('cart-footer-plate'))).toBe(true);
  });
});

describe('the line’s two controls', () => {
  /** RNTL types host props as `any`; narrow the one prop read here. */
  const slop = (node: unknown) =>
    (node as { props?: { hitSlop?: { left: number; right: number } } }).props?.hitSlop ?? {
      left: 0,
      right: 0,
    };

  // ==========================================================================
  // THE GAP THAT MATTERS IS THE ONE YOU CANNOT SEE.
  //
  // The stepper's `sm` buttons and the ghost trash button are both 36pt
  // silhouettes, and `hitSlopFor` grows each to the 44pt floor. At `gap: 4` the
  // two slops met exactly: the delete target began on the point the stepper's
  // ended, so a thumb aimed at "one fewer" that landed a few points right
  // removed the line. They looked 10pt apart and were 0 apart.
  // ==========================================================================
  it('leaves real space between "one fewer" and "delete"', () => {
    const { getByTestId } = renderApp(<CartScreen />);

    const gap = flatStyle(getByTestId('cart-line-p_whey:0-controls')).gap;
    const reach =
      slop(getByTestId('cart-line-p_whey:0-stepper-increase')).right +
      slop(getByTestId('cart-line-p_whey:0-remove')).left;

    expect(typeof gap).toBe('number');
    expect(gap as number).toBeGreaterThan(reach);
  });
});
