// @fit/mobile — freeze / resume mutations for the caller's own membership.
//
// The Profile hub's membership card (T7.9) drives these to pause or resume the
// signed-in member's subscription. Both invalidate the shared `me-subscription`
// query key on success so the card repaints with the new status, `frozenUntil`,
// and renewal date straight after the action — no manual refetch. The freeze
// service resolves the member from the session, so only the subscription id and
// duration cross the wire (see `lib/subscription-freeze`).

import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import {
  freezeSubscription,
  unfreezeSubscription,
  type FreezeResult,
  type UnfreezeResult,
} from '../lib/subscription-freeze';
import { meSubscriptionKey } from './useMeSubscription';

/** Pause the caller's membership for `durationDays` starting now. */
export function useFreezeSubscription(): UseMutationResult<
  FreezeResult,
  Error,
  { id: string; durationDays: number }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, durationDays }) =>
      freezeSubscription(id, { startDate: new Date().toISOString(), durationDays }),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: meSubscriptionKey() });
      }
    },
  });
}

/** Resume the caller's frozen membership early. */
export function useUnfreezeSubscription(): UseMutationResult<
  UnfreezeResult,
  Error,
  { id: string }
> {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id }) => unfreezeSubscription(id),
    onSuccess: (result) => {
      if (result.ok) {
        void queryClient.invalidateQueries({ queryKey: meSubscriptionKey() });
      }
    },
  });
}
