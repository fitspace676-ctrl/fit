// @fit/mobile — reading an order back after a purchase.
//
// `GET /checkout/:orderId`, **not** `GET /orders/:orderId`. The latter is
// `OrdersController` — the staff console's order-management surface, gated on
// `BillingRead`, which `ROLE_PERMISSIONS.MEMBER` does not include. The deleted
// app called it and would have 403'd on every confirmation screen, had the
// `POST /orders` before it not already 404'd.
//
// Keyed by `orderId` so the confirmation screen can be deep-linked to and
// refetched on its own, independently of the cart that produced it.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type { GetOrderResponse } from '@fit/types';
import { getCheckoutOrder } from '../../lib/api/checkout';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** Options for `GET /checkout/:orderId`. */
export function checkoutOrderQueryOptions(
  gymId: string | null,
  orderId: string | null | undefined,
): UseQueryOptions<GetOrderResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.checkoutOrder(scope.gymId, orderId ?? ''),
    queryFn: ({ signal }) => getCheckoutOrder({ orderId: orderId as string }, { signal }),
    enabled: scope.enabled && Boolean(orderId),
    // An order is immutable once placed, so re-entering the confirmation screen
    // should read the cache rather than the network.
    staleTime: 5 * 60_000,
  };
}

/**
 * The confirmation summary for one of the caller's own orders.
 *
 * Another member's or another gym's id is a `404` — never a disclosure that it
 * exists — so an error here is "not your order", not "something went wrong".
 */
export function useCheckoutOrder(orderId: string | null | undefined) {
  return useQuery(checkoutOrderQueryOptions(useGymId(), orderId));
}
