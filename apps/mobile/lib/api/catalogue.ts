// @fit/mobile — the public catalogues: what a gym sells and where.
//
// Four `@Public()` reads, all scoped by an explicit `gymId` query parameter
// rather than by the session, because the gym's web site serves the same
// endpoints to visitors with no account. The app always passes the session's gym
// id — `useActiveGym` is the single authority — and never a remembered slug.
//
// `GET /catalogue` is the aggregate the join funnel needs (locations + packages +
// plans + packs + intake settings) in one round trip; the three narrow endpoints
// are what a screen that only needs one of those lists should call.

import type {
  ListLocationsResponse,
  ListPackagesQuery,
  ListPackagesResponse,
  ListProductsResponse,
  SignupCatalogueQuery,
  SignupCatalogueResponse,
} from '@fit/types';
import { apiJson } from '../http/api-client';
import { ENDPOINTS, endpointPath, type FetchOptions } from './endpoints';

/**
 * `GET /catalogue?gymId&locationId?` — everything the membership funnel's
 * product step renders, in one request.
 *
 * An unknown gym yields empty arrays rather than a `404`; the step shows its
 * empty state. `freeAccount`, `memberIntake` and the start-date window travel
 * with it because a visitor filling the join form has no session and no other
 * way to be told which fields the gym asks for.
 */
export async function getCatalogue(
  params: SignupCatalogueQuery,
  options: FetchOptions = {},
): Promise<SignupCatalogueResponse> {
  return apiJson<SignupCatalogueResponse>(endpointPath(ENDPOINTS.getCatalogue), {
    method: ENDPOINTS.getCatalogue.method,
    query: { gymId: params.gymId, locationId: params.locationId },
    signal: options.signal,
  });
}

/**
 * `GET /products?gymId` — the retail shop's listing.
 *
 * Every active product with its variants and stock. An empty array is a normal
 * `200` (a gym that sells nothing), not an error.
 */
export async function listProducts(
  params: { gymId: string },
  options: FetchOptions = {},
): Promise<ListProductsResponse> {
  return apiJson<ListProductsResponse>(endpointPath(ENDPOINTS.listProducts), {
    method: ENDPOINTS.listProducts.method,
    query: { gymId: params.gymId },
    signal: options.signal,
  });
}

/**
 * `GET /packages?gymId&locationId?` — purchasable personal-training packages.
 *
 * `locationId` narrows to packages sold at one branch; some catalogues are
 * gym-wide, which is why it is optional rather than defaulted.
 */
export async function listPackages(
  params: ListPackagesQuery,
  options: FetchOptions = {},
): Promise<ListPackagesResponse> {
  return apiJson<ListPackagesResponse>(endpointPath(ENDPOINTS.listPackages), {
    method: ENDPOINTS.listPackages.method,
    query: { gymId: params.gymId, locationId: params.locationId },
    signal: options.signal,
  });
}

/**
 * `GET /locations?gymId` — the gym's active branches, in display order.
 *
 * These are the pickup points `POST /cart/checkout` accepts as `locationId` for
 * a `PICKUP` fulfilment, so the shop's checkout sheet reads this list rather
 * than asking the buyer to type an address.
 */
export async function listLocations(
  params: { gymId: string },
  options: FetchOptions = {},
): Promise<ListLocationsResponse> {
  return apiJson<ListLocationsResponse>(endpointPath(ENDPOINTS.listLocations), {
    method: ENDPOINTS.listLocations.method,
    query: { gymId: params.gymId },
    signal: options.signal,
  });
}
