// @fit/mobile — the freeze / resume mutations for the member's own membership.
//
// Pairs the Profile tab's membership card (T7.9) with TanStack Query mutations
// that keep the cache honest: a successful freeze or resume changes the member's
// subscription status and period, so both invalidate the `me-subscription` query
// the card reads — it repaints (Active → Frozen, new renewal date) with no manual
// state juggling. The mutation functions return the lib's discriminated result
// (never throw on a domain error), so the screen can toast the exact `code`.

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type {
  FreezeSubscriptionData,
  FreezeSubscriptionResponse,
  UnfreezeSubscriptionResponse,
} from '@fit/types';
import {
  freezeSubscription,
  unfreezeSubscription,
  type SubscriptionActionResult,
} from '../lib/subscriptions';
import { meSubscriptionKey } from './useMeSubscription';

export interface SubscriptionActions {
  /** Freeze the membership for a chosen number of whole days. */
  freeze: UseMutationResult<
    SubscriptionActionResult<FreezeSubscriptionResponse>,
    Error,
    FreezeSubscriptionData
  >;
  /** Resume a frozen membership early. */
  resume: UseMutationResult<SubscriptionActionResult<UnfreezeSubscriptionResponse>, Error, void>;
}

/**
 * Freeze / resume mutations for subscription `subscriptionId`. Both revalidate the
 * member's subscription on settle (success or failure) so the card always reflects
 * the server's truth. `subscriptionId` may be `null` while the subscription is
 * still loading — the mutations reject cleanly in that window.
 */
export function useSubscriptionActions(subscriptionId: string | null): SubscriptionActions {
  const queryClient = useQueryClient();

  const invalidate = (): Promise<void> => {
    void queryClient.invalidateQueries({ queryKey: meSubscriptionKey() });
    return Promise.resolve();
  };

  const freeze = useMutation<
    SubscriptionActionResult<FreezeSubscriptionResponse>,
    Error,
    FreezeSubscriptionData
  >({
    mutationFn: (body) => {
      if (!subscriptionId) throw new Error('No subscription to freeze');
      return freezeSubscription(subscriptionId, body);
    },
    onSettled: invalidate,
  });

  const resume = useMutation<SubscriptionActionResult<UnfreezeSubscriptionResponse>, Error, void>({
    mutationFn: () => {
      if (!subscriptionId) throw new Error('No subscription to resume');
      return unfreezeSubscription(subscriptionId);
    },
    onSettled: invalidate,
  });

  return { freeze, resume };
}
