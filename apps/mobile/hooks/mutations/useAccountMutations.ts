// @fit/mobile — the profile and the goal set.
//
// Both endpoints answer with the written record, so both `setQueryData` from the
// response *and* invalidate: the write-through makes the form stop showing the
// old value on the frame the request resolves, and the invalidation is the cheap
// insurance that a server-side normalisation (a trimmed name, a defaulted goal
// `unit`) is not left out of sync with what the user typed.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type {
  ListMeGoalsResponse,
  PutMeGoalsInput,
  UpdateMeProfileInput,
  UpdateMeProfileResponse,
} from '@fit/types';
import { replaceMyGoals, updateMyProfile } from '../../lib/api/me';
import { queryKeys } from '../../lib/query-keys';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `PATCH /me/profile`. */
export function updateMyProfileMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<UpdateMeProfileResponse, Error, UpdateMeProfileInput> {
  return {
    mutationKey: ['updateMyProfile'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Updating a profile');
      return updateMyProfile(input);
    },
    onSuccess: (response) => {
      const gymId = requireGymId(deps.gymId, 'Updating a profile');
      deps.queryClient.setQueryData(queryKeys.profile(gymId), response);
      invalidateFor(deps.queryClient, gymId, 'updateMyProfile');
    },
  };
}

/**
 * Update name and/or phone.
 *
 * Send only the fields that changed — the schema is `.strict()` and the endpoint
 * writes exactly what it is given. `phone: null` clears the number; omitting
 * `phone` leaves it. A form must not collapse those two into one request.
 */
export function useUpdateMyProfile() {
  return useMutation(updateMyProfileMutationOptions(useMutationDeps()));
}

/** `PUT /me/goals`. */
export function replaceMyGoalsMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<ListMeGoalsResponse, Error, PutMeGoalsInput> {
  return {
    mutationKey: ['replaceMyGoals'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Saving goals');
      return replaceMyGoals(input);
    },
    onSuccess: (response) => {
      const gymId = requireGymId(deps.gymId, 'Saving goals');
      deps.queryClient.setQueryData(queryKeys.goals(gymId), response);
      invalidateFor(deps.queryClient, gymId, 'replaceMyGoals');
    },
  };
}

/**
 * Replace the whole goal set (max 8).
 *
 * A `PUT`: the body **is** the new set, so a goal missing from the array is
 * deleted and `{ goals: [] }` clears them all.
 */
export function useReplaceMyGoals() {
  return useMutation(replaceMyGoalsMutationOptions(useMutationDeps()));
}
