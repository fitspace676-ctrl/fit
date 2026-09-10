// @fit/mobile — the server-side cart, read.
//
// ## Signed out, the cart is empty — without a request
//
// `GET /cart` with no session does not 401. `CartIdentityMiddleware` passes the
// request through, `SubdomainTenantMiddleware` finds no `<slug>.fit.ge` host
// (the app talks to the API by IP or apex), and `CartService.identity()` then
// reads `tenant.gymId`, whose getter throws — a **500**. So the client does not
// make the call at all: `getCartOrEmpty` short-circuits it (documented exception
// #2 of the API client), and this hook is disabled without a gym anyway.
//
// The consequence to state plainly: **this app's cart is Bearer-scoped only.**
// It sends `credentials: 'omit'` (D3), so there is no guest-cookie cart to
// inherit — a signed-out browse shows an empty cart, and adding to it requires
// signing in first. That is a product decision baked into WP-3, not an oversight
// here.
//
// `currency` is a parameter because an empty cart has no line to read it from
// and the gym's currency is a property of the gym. Pass the same one the product
// listing renders in; passing the wrong one shows `$0.00` to a gym selling in GEL.

import { useQuery, type UseQueryOptions, type UseQueryResult } from '@tanstack/react-query';
import type { CartView } from '@fit/types';
import { emptyCart, getCart } from '../../lib/api/cart';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** Options for `GET /cart`. */
export function cartQueryOptions(
  gymId: string | null,
  currency: string,
): UseQueryOptions<CartView> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.cart(scope.gymId),
    queryFn: ({ signal }) => getCart({ currency }, { signal }),
    enabled: scope.enabled,
    // The cart is the one resource where "slightly stale" is a wrong price on a
    // buy button, and every mutation writes the authoritative copy back anyway.
    staleTime: 0,
  };
}

/**
 * The current cart.
 *
 * `data` is `undefined` until the first fetch resolves and while signed out —
 * use {@link useCartOrEmpty} when a screen needs a value it can render
 * unconditionally.
 */
export function useCart(currency: string) {
  return useQuery(cartQueryOptions(useGymId(), currency));
}

/** {@link useCartOrEmpty}'s answer: a value to render, and the query behind it. */
export interface CartOrEmpty {
  /**
   * The cart, or an empty one — safe to render on the very first frame.
   *
   * Read this for the number. Never read it for the ANSWER to "is this line in
   * the cart?" without consulting {@link query} first.
   */
  readonly cart: CartView;
  /**
   * The query the value came from — so a screen can tell the three apart.
   *
   * See the note on {@link useCartOrEmpty}.
   */
  readonly query: UseQueryResult<CartView>;
}

/**
 * The cart, or an empty one, **beside the query that produced it**.
 *
 * ===========================================================================
 * `?? emptyCart()` COLLAPSES THREE STATES INTO ONE, AND ONE OF THEM IS A LIE.
 *
 * `data === undefined` means "no cart yet" (first frame, or signed out) OR
 * "the request failed". Folding both into an empty cart makes a FAILURE
 * indistinguishable from a fact:
 *
 *   * the bag badge vanishes — the member is told their cart is empty;
 *   * `qtyOf(cart, ref)` returns 0, so the row's stepper reverts to **+**, and
 *     pressing it POSTs a second line for something already in the cart.
 *
 * That is the same shape as the deleted app's hardcoded `ACTIVE`: a status
 * derived from the absence of data in a query nobody checked. The value still
 * has to exist on the first frame — the header cannot wait — so the fix is not
 * to withhold it but to hand the caller the evidence alongside it, and every
 * shop screen renders a note when `query.isError`.
 * ===========================================================================
 */
export function useCartOrEmpty(currency: string): CartOrEmpty {
  const query = useCart(currency);
  return { cart: query.data ?? emptyCart(currency), query };
}
