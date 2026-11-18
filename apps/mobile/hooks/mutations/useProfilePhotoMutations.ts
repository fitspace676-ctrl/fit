import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import {
  uploadProfilePhoto,
  removeProfilePhoto,
  type LocalProfilePhoto,
  type ProfilePhotoResponse,
} from '../../lib/api/profile-photo';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

export function uploadProfilePhotoMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<ProfilePhotoResponse, Error, LocalProfilePhoto> {
  return {
    mutationKey: ['uploadProfilePhoto'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Uploading a profile photo');
      return uploadProfilePhoto(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Uploading a profile photo'),
        'uploadProfilePhoto',
      );
    },
  };
}

export function removeProfilePhotoMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<ProfilePhotoResponse, Error, void> {
  return {
    mutationKey: ['removeProfilePhoto'],
    mutationFn: () => {
      requireGymId(deps.gymId, 'Removing a profile photo');
      return removeProfilePhoto();
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Removing a profile photo'),
        'removeProfilePhoto',
      );
    },
  };
}

export function useUploadProfilePhoto() {
  return useMutation(uploadProfilePhotoMutationOptions(useMutationDeps()));
}

export function useRemoveProfilePhoto() {
  return useMutation(removeProfilePhotoMutationOptions(useMutationDeps()));
}
