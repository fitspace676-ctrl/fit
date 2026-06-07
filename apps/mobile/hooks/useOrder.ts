// @fit/mobile — one order's confirmation summary as a TanStack Query.
//
// The order confirmation screen (T6.7), reached after checkout and as the target
// of the `fit://orders/:orderId` deep link, reads this to render the placed
// order. `fetchOrder` returns `null` for an unknown id (a 404), which the screen
// renders as its "order not found" state — so the query resolves to `null`
// rather than erroring on a bad/stale deep link.

import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import type { OrderSummary } from '@fit/types';
import { fetchOrder } from '../lib/shop';

/** The query key for a single order's summary. */
export function orderKey(orderId: string | null) {
  return ['order', orderId] as const;
}

/**
 * Load one order's confirmation summary. Pass `orderId: null` (e.g. a missing
 * route param) to keep the query disabled. Resolves to `null` when the id names
 * no order, distinct from the loading / error states.
 */
export function useOrder(orderId: string | null): UseQueryResult<OrderSummary | null> {
  return useQuery({
    queryKey: orderKey(orderId),
    queryFn: ({ signal }) => fetchOrder({ orderId: orderId as string, signal }),
    enabled: orderId !== null,
  });
}
