// @fit/mobile — the cart-checkout mutation (T6.7).
//
// Pairs the cart screen's "Checkout" action with a TanStack Query mutation that
// turns the current cart into a pending order (`POST /orders`). On success the
// cart is emptied and the member's bookings/orders surfaces are left to refetch
// on their own; the screen reads the returned `orderId` to navigate to the
// confirmation. Mutations don't retry by default, which is what we want — a
// checkout is not safe to fire twice blindly; the caller drives one attempt.

import { useMutation, type UseMutationResult } from '@tanstack/react-query';
import type { CreateOrderResponse, ShopOrderItem } from '@fit/types';
import { createShopOrder } from '../lib/shop';
import { useCart } from '../providers/CartProvider';

/** What the checkout mutation needs from the caller at fire time. */
export interface CheckoutVariables {
  gymId: string;
  items: ShopOrderItem[];
}

/**
 * Checkout mutation for the active cart. `mutateAsync({ gymId, items })` creates
 * the order and, on success, clears the cart so a return to the shop starts
 * clean. Returns the raw mutation object so the screen can read `isPending` to
 * disable the button and await the result to navigate / toast.
 */
export function useCheckout(): UseMutationResult<CreateOrderResponse, Error, CheckoutVariables> {
  const { clear } = useCart();

  return useMutation<CreateOrderResponse, Error, CheckoutVariables>({
    mutationFn: ({ gymId, items }) => createShopOrder({ gymId, items }),
    onSuccess: () => clear(),
  });
}
