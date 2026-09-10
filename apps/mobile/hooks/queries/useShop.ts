// @fit/mobile — the four public catalogue reads the shop and join funnel need.
//
// All `@Public()` on the API and all gym-scoped in the cache, for the reason
// `useClasses.ts` states: the `gymId` on the wire and the `gymId` at index 1 of
// the key are the same value, from one authority.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  ListLocationsResponse,
  ListPackagesResponse,
  ListProductsResponse,
  SignupCatalogueResponse,
} from '@fit/types';
import { getCatalogue, listLocations, listPackages, listProducts } from '../../lib/api/catalogue';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** Options for `GET /products`. */
export function productsQueryOptions(gymId: string | null): UseQueryOptions<ListProductsResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.products(scope.gymId),
    queryFn: ({ signal }) => listProducts({ gymId: scope.gymId }, { signal }),
    enabled: scope.enabled,
  };
}

/**
 * The retail listing.
 *
 * Invalidated by a completed cart checkout: stock moved, and a card reading
 * "3 left" is wrong the moment an order is placed.
 *
 * **`gymId` is optional, and omitting it is not the same as passing `null`.**
 * Omitted, the hook scopes itself by the session — what an `auth` route wants
 * (home). Passed, it uses exactly what it is given, which is how a `public`
 * route hands it the discovery gym (`hooks/useDiscoveryGym.ts`): `GET /products`
 * is `@Public()` and takes the tenant as a query param precisely so a
 * signed-out visitor can read it. `null` is still "no gym, stay disabled".
 *
 * The session read happens either way — the rules of hooks leave no choice —
 * and costs nothing: it is a `useSyncExternalStore` over an in-memory snapshot.
 */
export function useProducts(gymId?: string | null) {
  const sessionGymId = useGymId();
  return useQuery(productsQueryOptions(gymId === undefined ? sessionGymId : gymId));
}

/** Options for `GET /packages`. */
export function packagesQueryOptions(
  gymId: string | null,
  locationId?: string,
): UseQueryOptions<ListPackagesResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.packages(scope.gymId, locationId),
    queryFn: ({ signal }) => listPackages({ gymId: scope.gymId, locationId }, { signal }),
    enabled: scope.enabled,
  };
}

/**
 * Purchasable personal-training packages, optionally narrowed to one branch.
 *
 * `locationId` IS in the key (`['packages', gymId, locationId ?? null]`), so
 * switching branch is a new cache entry rather than the previous branch's list
 * served back forever. No mutation row names `packages`, so there is no
 * `RESOURCE_ROOTS` entry to slice — `resourceRoot()` is there if one is ever
 * owed.
 */
export function usePackages(locationId?: string) {
  return useQuery(packagesQueryOptions(useGymId(), locationId));
}

/** Options for `GET /locations`. */
export function locationsQueryOptions(
  gymId: string | null,
): UseQueryOptions<ListLocationsResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.locations(scope.gymId),
    queryFn: ({ signal }) => listLocations({ gymId: scope.gymId }, { signal }),
    enabled: scope.enabled,
  };
}

/**
 * The gym's branches.
 *
 * These are the pickup points `POST /cart/checkout` accepts as `locationId` for
 * a `PICKUP` fulfilment, so the checkout sheet reads this rather than asking for
 * a typed address.
 */
export function useLocations() {
  return useQuery(locationsQueryOptions(useGymId()));
}

/** Options for `GET /catalogue`. */
export function catalogueQueryOptions(
  gymId: string | null,
  locationId?: string,
): UseQueryOptions<SignupCatalogueResponse> {
  const scope = gymScope(gymId);
  return {
    // `locationId` is ON THE WIRE, so it is in the key. Anything less and the
    // same key serves two different requests.
    queryKey: queryKeys.catalogue(scope.gymId, locationId),
    queryFn: ({ signal }) => getCatalogue({ gymId: scope.gymId, locationId }, { signal }),
    enabled: scope.enabled,
  };
}

/**
 * The join funnel's aggregate: locations, packages, plans, credit packs, the
 * free-account offer, and which profile fields this gym's intake asks for — one
 * round trip, because the step that needs it has no session and no other way to
 * be told.
 *
 * `locationId` is part of the key, so the join funnel's branch picker gets a
 * fresh read per branch. The `createCheckout` invalidation row reaches all of
 * them through the two-segment root.
 */
export function useCatalogue(locationId?: string) {
  return useQuery(catalogueQueryOptions(useGymId(), locationId));
}
