// @fit/mobile — buying a class-credit pack.
//
// The credit balance this creates is what a class booking spends, so the same
// key (`queryKeys.creditPacks`) is invalidated by `bookClass` / `cancelBooking`
// as well. One resource, three writers, one row each in the matrix.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { PurchaseCreditPackInput, PurchaseCreditPackResponse } from '@fit/types';
import { purchaseCreditPack } from '../../lib/api/credit-packs';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `POST /credit-packs/purchase`. */
export function purchaseCreditPackMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<PurchaseCreditPackResponse, Error, PurchaseCreditPackInput> {
  return {
    mutationKey: ['purchaseCreditPack'],
    // A purchase. See `useCheckoutMutations.ts` — retrying creates a second order.
    retry: false,
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Buying a credit pack');
      return purchaseCreditPack(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Buying a credit pack'),
        'purchaseCreditPack',
      );
    },
  };
}

/**
 * Buy a credit pack.
 *
 * Returns the new `creditPackId` **and** the `PAID` `orderId` it was recorded
 * on, so a confirmation screen can be keyed off the order regardless of what
 * product type was bought.
 */
export function usePurchaseCreditPack() {
  return useMutation(purchaseCreditPackMutationOptions(useMutationDeps()));
}
