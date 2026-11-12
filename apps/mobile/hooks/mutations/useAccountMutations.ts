// @fit/mobile — profile updates write through to the cache and invalidate it.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { UpdateMeProfileInput, UpdateMeProfileResponse } from '@fit/types';
import { updateMyProfile } from '../../lib/api/me';
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
