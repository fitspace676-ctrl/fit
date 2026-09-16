// @fit/mobile — the member's own purchase history, one page at a time.
//
// `GET /me/orders` is server-paginated (`limit` capped at 50) because a
// membership's history grows without bound, so this is the app's one
// `useInfiniteQuery`: "load more" appends a page instead of re-reading a bigger
// one, and the pages already fetched stay in the cache when the member walks
// into an order and back out.
//
// `getNextPageParam` counts what has been RECEIVED rather than trusting the
// page number: `total` is the whole history, so the end is "we hold as many rows
// as the server says exist". A page that comes back short (the last one) also
// stops it, which is what keeps a deleted order from producing an endless list
// of empty pages.
//
// SESSION-scoped, not discovery-scoped: there is no `gymId` on the wire here —
// the caller is resolved from the token — so without a session the query is
// disabled and the screen renders its signed-out branch instead.

import { useInfiniteQuery } from '@tanstack/react-query';
import type { ListMyOrdersResponse } from '@fit/types';
import { listMyOrders } from '../../lib/api/orders';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** Rows per page. Under the server's cap of 50, and a phone screen's worth. */
export const MY_ORDERS_PAGE_SIZE = 20;

/** Options for the paged `GET /me/orders`. */
export function myOrdersQueryOptions(gymId: string | null, limit: number = MY_ORDERS_PAGE_SIZE) {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.myOrders(scope.gymId, { limit }),
    queryFn: ({ signal, pageParam }: { signal: AbortSignal; pageParam: number }) =>
      listMyOrders({ page: pageParam, limit }, { signal }),
    initialPageParam: 1,
    getNextPageParam: (
      lastPage: ListMyOrdersResponse,
      pages: ListMyOrdersResponse[],
    ): number | undefined => {
      const held = pages.reduce((sum, page) => sum + page.orders.length, 0);
      // A short page is the last page, whatever `total` claims.
      if (lastPage.orders.length < limit) return undefined;
      return held >= lastPage.total ? undefined : lastPage.page + 1;
    },
    enabled: scope.enabled,
  };
}

/**
 * The member's own orders, newest first, paged.
 *
 * `data.pages.flatMap((page) => page.orders)` is the list; `data.pages[0].total`
 * is how long it will eventually be.
 */
export function useMyOrders(limit: number = MY_ORDERS_PAGE_SIZE) {
  return useInfiniteQuery(myOrdersQueryOptions(useGymId(), limit));
}
