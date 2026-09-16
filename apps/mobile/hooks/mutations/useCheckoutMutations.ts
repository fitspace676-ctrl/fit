// @fit/mobile — the two purchases.
//
// Never optimistic, never auto-retried. `mutations.retry` is `false` by default
// in `lib/query-client.ts` for exactly this reason: a retried checkout can
// create two orders.
//
// `checkoutCart` resolves — it does not reject — for the two failures that are
// part of its contract, so a screen branches on `outcome.ok` rather than on an
// error boundary. That shape is load-bearing: `409 PRICE_CHANGED` carries the
// new prices and `422 OUT_OF_STOCK` the dropped lines, and an `ApiError` can
// carry neither.
//
// **`PRICE_CHANGED` must not auto-retry.** The server has already re-priced the
// cart, so an immediate identical retry succeeds — which is precisely the trap:
// it would charge a price the buyer never saw. The retry has to come from a
// second, deliberate press after the deltas are on screen.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { CartCheckoutInput, CreateCheckoutInput, CreateCheckoutResponse } from '@fit/types';
import { checkoutCart, createCheckout, type CartCheckoutOutcome } from '../../lib/api/checkout';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `POST /cart/checkout` — the shop's purchase. */
export function checkoutCartMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<CartCheckoutOutcome, Error, CartCheckoutInput> {
  return {
    mutationKey: ['checkoutCart'],
    // Explicit, not inherited: a retried checkout can create two orders, and
    // this is the one mutation where restating the default is worth the line.
    retry: false,
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Checking out');
      return checkoutCart(input);
    },
    onSuccess: (outcome) => {
      const gymId = requireGymId(deps.gymId, 'Checking out');
      if (outcome.ok) {
        // The cart is empty server-side and stock moved for every line bought.
        invalidateFor(deps.queryClient, gymId, 'checkoutCart');
        return;
      }
      if (outcome.reason === 'PRICE_CHANGED') {
        // Nothing was bought, but the server re-priced the cart on its way to
        // rejecting — the cached cart is showing prices that no longer exist.
        invalidateFor(deps.queryClient, gymId, 'checkoutCartPriceChanged');
        return;
      }
      // OUT_OF_STOCK: the server removed the unfulfillable lines from the cart,
      // and it just learned their stock is gone.
      invalidateFor(deps.queryClient, gymId, 'checkoutCartOutOfStock');
    },
  };
}

/**
 * Check the retail cart out.
 *
 * Resolves with a {@link CartCheckoutOutcome}: `{ ok: true, orderId }`, or
 * `{ ok: false, reason: 'PRICE_CHANGED' | 'OUT_OF_STOCK', … }`. Read the order
 * back with `useCheckoutOrder(orderId)` — **not** `GET /orders/:id`, which is
 * `BillingRead` and 403s for a member.
 */
export function useCheckoutCart() {
  return useMutation(checkoutCartMutationOptions(useMutationDeps()));
}

/** `POST /checkout` — the membership funnel's purchase. */
export function createCheckoutMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<CreateCheckoutResponse, Error, CreateCheckoutInput> {
  return {
    mutationKey: ['createCheckout'],
    retry: false,
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Checking out');
      return createCheckout(input);
    },
    onSuccess: () => {
      invalidateFor(deps.queryClient, requireGymId(deps.gymId, 'Checking out'), 'createCheckout');
    },
  };
}

/**
 * Buy a plan, a package, or a credit pack.
 *
 * Exactly one of `orderId` / `subscriptionId` comes back, keyed by
 * `productType`: a package or pack settles onto an `Order`, a subscription mints
 * an `Invoice` instead. A confirmation screen reads the first with
 * `useCheckoutOrder`, the second with `useMembership`.
 */
export function useCreateCheckout() {
  return useMutation(createCheckoutMutationOptions(useMutationDeps()));
}
