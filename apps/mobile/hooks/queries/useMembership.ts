// @fit/mobile — the membership card, and the credits behind the book button.
//
// `useMembership` is the query the deleted app did not have: its home screen
// hardcoded `ACTIVE`, `22/30` and `73%`. Every one of those numbers is in
// `GET /me/subscription`, along with the freeze allowance and the invoice
// history — one endpoint, one key, no derived state to drift.

import { useQuery, type UseQueryOptions } from '@tanstack/react-query';
import type {
  GetMeSubscriptionResponse,
  ListCreditPackCatalogueResponse,
  ListCreditPacksResponse,
} from '@fit/types';
import { getMySubscription } from '../../lib/api/me';
import { listCreditPackCatalogue, listMyCreditPacks } from '../../lib/api/credit-packs';
import { queryKeys } from '../../lib/query-keys';
import { useGymId } from '../useActiveGym';
import { gymScope } from './scope';

/** Options for `GET /me/subscription`. */
export function membershipQueryOptions(
  gymId: string | null,
): UseQueryOptions<GetMeSubscriptionResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.membership(scope.gymId),
    queryFn: ({ signal }) => getMySubscription({ signal }),
    enabled: scope.enabled,
  };
}

/**
 * The current membership **and** its invoice history.
 *
 * `subscription: null` is a real, renderable state — a member who has never
 * subscribed — not an error. `freezeDaysRemaining` is on the same payload, so a
 * freeze sheet can disable its control instead of discovering the plan's
 * allowance as a 400.
 *
 * Anything that raises an invoice invalidates this key, including a
 * personal-training session booking; there is no separate invoices query.
 */
export function useMembership() {
  return useQuery(membershipQueryOptions(useGymId()));
}

/** Options for `GET /members/me/credit-packs`. */
export function creditPacksQueryOptions(
  gymId: string | null,
): UseQueryOptions<ListCreditPacksResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.creditPacks(scope.gymId),
    queryFn: ({ signal }) => listMyCreditPacks({ signal }),
    enabled: scope.enabled,
  };
}

/**
 * The caller's credit packs and remaining balances.
 *
 * Booking a class **spends** one of these and cancelling refunds it, so this key
 * is invalidated by the booking mutations as well as by a purchase — the gap
 * that made the deleted app show a stale balance after every booking.
 */
export function useCreditPacks() {
  return useQuery(creditPacksQueryOptions(useGymId()));
}

/** Options for `GET /credit-packs/catalogue`. */
export function packCatalogueQueryOptions(
  gymId: string | null,
): UseQueryOptions<ListCreditPackCatalogueResponse> {
  const scope = gymScope(gymId);
  return {
    queryKey: queryKeys.packCatalogue(scope.gymId),
    queryFn: ({ signal }) => listCreditPackCatalogue({ signal }),
    enabled: scope.enabled,
  };
}

/** The credit packs currently on sale. */
export function usePackCatalogue() {
  return useQuery(packCatalogueQueryOptions(useGymId()));
}
