// @fit/mobile — class-credit packs (`/credit-packs/*`, `/members/me/credit-packs`).
//
// A credit pack is the currency a class seat is bought with: booking charges one
// credit, cancelling refunds it (`apps/api/src/classes/bookings.service.ts`). So
// this file's balances are downstream of the *booking* mutations as well as of
// the purchase here — which is why `bookClass` / `cancelBooking` both invalidate
// `queryKeys.creditPacks(gymId)`.
//
// Note the split: the caller's own packs live under `/members/me/credit-packs`
// (the one `/members/*` route a MEMBER may call — it is `CreditPackManage`, not
// the roster's `MemberRead`), while what is *on sale* is `/credit-packs/catalogue`.

import type {
  ListCreditPackCatalogueResponse,
  ListCreditPacksResponse,
  PurchaseCreditPackInput,
  PurchaseCreditPackResponse,
} from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * `GET /members/me/credit-packs` — the caller's packs and their remaining
 * balances.
 *
 * The number the profile screen renders, and the number a "book" button's
 * affordance depends on.
 */
export async function listMyCreditPacks(
  options: FetchOptions = {},
): Promise<ListCreditPacksResponse> {
  return apiJson<ListCreditPacksResponse>(endpointPath(ENDPOINTS.listMyCreditPacks), {
    method: ENDPOINTS.listMyCreditPacks.method,
    signal: options.signal,
  });
}

/** `GET /credit-packs/catalogue` — the packs currently on sale. */
export async function listCreditPackCatalogue(
  options: FetchOptions = {},
): Promise<ListCreditPackCatalogueResponse> {
  return apiJson<ListCreditPackCatalogueResponse>(endpointPath(ENDPOINTS.listCreditPackCatalogue), {
    method: ENDPOINTS.listCreditPackCatalogue.method,
    signal: options.signal,
  });
}

/**
 * `POST /credit-packs/purchase` — buy a pack.
 *
 * The member and gym come off the session, never the body. `promoCode` is
 * checked against the `packages` scope (a credit pack *is* a package plan), so
 * a "20% off packages" code discounts it — and an inapplicable code is refused
 * loudly rather than silently ignored, which is the only way a buyer expecting a
 * discount never quietly pays full price.
 *
 * Returns both the new `creditPackId` and the `PAID` `orderId` it was recorded
 * on, so a flow that settles several product types can key one confirmation
 * screen off the order regardless of what was bought.
 */
export async function purchaseCreditPack(
  input: PurchaseCreditPackInput,
  options: FetchOptions = {},
): Promise<PurchaseCreditPackResponse> {
  return apiJson<PurchaseCreditPackResponse>(endpointPath(ENDPOINTS.purchaseCreditPack), {
    method: ENDPOINTS.purchaseCreditPack.method,
    json: input,
    signal: options.signal,
  });
}
