// @fit/mobile — enrol, freeze, unfreeze.
//
// Freeze and unfreeze reach past the membership card: a `FROZEN` subscription
// cannot book, so the schedule's affordances and the existing bookings' actions
// both change meaning. That is why their rows carry `classes` and `bookings` —
// see `invalidation.ts`.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type {
  EnrollSubscriptionResponse,
  FreezeSubscriptionInput,
  FreezeSubscriptionResponse,
  UnfreezeSubscriptionResponse,
} from '@fit/types';
import {
  enrollSubscription,
  freezeSubscription,
  unfreezeSubscription,
} from '../../lib/api/subscriptions';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `POST /subscriptions`. */
export function enrollSubscriptionMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<EnrollSubscriptionResponse, Error, { planId: string }> {
  return {
    mutationKey: ['enrollSubscription'],
    retry: false,
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Enrolling on a plan');
      return enrollSubscription(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Enrolling on a plan'),
        'enrollSubscription',
      );
    },
  };
}

/** Enrol the caller on a plan. `409 ALREADY_SUBSCRIBED` when one is already live. */
export function useEnrollSubscription() {
  return useMutation(enrollSubscriptionMutationOptions(useMutationDeps()));
}

/** `POST /subscriptions/:id/freeze`. */
export function freezeSubscriptionMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<
  FreezeSubscriptionResponse,
  Error,
  { subscriptionId: string } & FreezeSubscriptionInput
> {
  return {
    mutationKey: ['freezeSubscription'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Freezing a membership');
      return freezeSubscription(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Freezing a membership'),
        'freezeSubscription',
      );
    },
  };
}

/**
 * Pause the membership from `startDate` for `durationDays`.
 *
 * `GET /me/subscription` already carries `freezeDaysRemaining`, so the sheet
 * should disable the control rather than discover the plan's allowance as a
 * `400`.
 */
export function useFreezeSubscription() {
  return useMutation(freezeSubscriptionMutationOptions(useMutationDeps()));
}

/** `POST /subscriptions/:id/unfreeze`. */
export function unfreezeSubscriptionMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<UnfreezeSubscriptionResponse, Error, { subscriptionId: string }> {
  return {
    mutationKey: ['unfreezeSubscription'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Unfreezing a membership');
      return unfreezeSubscription(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Unfreezing a membership'),
        'unfreezeSubscription',
      );
    },
  };
}

/**
 * Resume now.
 *
 * `newPeriodEnd` is the renewal instant after pushing it out by the days
 * actually spent frozen — the card must re-read it rather than compute it.
 */
export function useUnfreezeSubscription() {
  return useMutation(unfreezeSubscriptionMutationOptions(useMutationDeps()));
}
