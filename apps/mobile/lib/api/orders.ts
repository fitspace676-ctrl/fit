// @fit/mobile — the member's own order history.
//
// `GET /me/orders`, and deliberately not `GET /orders`: the latter is
// `OrdersController`, the staff console's order-management surface, gated on
// `BillingRead` — a permission `ROLE_PERMISSIONS.MEMBER` does not hold. Calling
// it is the 403 that sat beside the deleted app's `POST /orders` 404; see
// `lib/api/checkout.ts` for the pair this completes.
//
// The rows are SUMMARIES (`MemberOrderSummary`): a date, a state, a total and
// the first `MY_ORDER_LABEL_PREVIEW` line labels — enough for a card to be
// recognised. The itemised breakdown stays on `GET /checkout/:orderId`, which
// the order screen already renders, so the list links into the detail rather
// than forking it.
//
// Pagination is the server's, not a client-side slice: a membership's purchase
// history grows without bound, `limit` is capped at 50, and `total` comes back
// so the caller knows when it has reached the end.

import type { ListMyOrdersResponse } from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * The pager, as a caller supplies it.
 *
 * Not `ListMyOrdersQueryInput`: that is `z.input` of a `z.coerce.number()`
 * schema, i.e. `unknown` — correct for a server parsing a URL, useless for a
 * client building one. Both fields are optional because both default
 * server-side, so a bare call sends no query string at all.
 */
export interface ListMyOrdersParams {
  /** 1-based. */
  readonly page?: number;
  /** Rows per page. The server caps this at 50; over it is a `400`. */
  readonly limit?: number;
}

/**
 * `GET /me/orders?page&limit` — one page of the caller's orders, newest first.
 *
 * Both params default server-side (`page: 1`, `limit: 20`), so a bare call is
 * valid and sends no query string at all. There is no member id on the wire: the
 * caller is resolved from the session, which is what makes the route safe to
 * expose to a member in the first place.
 */
export async function listMyOrders(
  params: ListMyOrdersParams = {},
  options: FetchOptions = {},
): Promise<ListMyOrdersResponse> {
  return apiJson<ListMyOrdersResponse>(endpointPath(ENDPOINTS.listMyOrders), {
    method: ENDPOINTS.listMyOrders.method,
    query: { page: params.page, limit: params.limit },
    signal: options.signal,
  });
}
