// @fit/mobile — the inbox's one write, and push-token registration.
//
// `markNotificationsRead` invalidates the two-segment `['notifications', gymId]`
// root rather than the key `queryKeys.notifications(gymId)` returns. That is not
// a shortcut: the factory takes `filters` at index 2 and defaults it to `null`,
// so its return value names *one* filter bucket. Invalidating that alone would
// leave an `unreadOnly: true` list and the `['notifications', gymId,
// 'unreadCount']` badge untouched — the "badge says 3, inbox is empty" bug the
// factory's own doc comment promises against. `resourceRoot()` in
// `invalidation.ts` recovers the prefix from the factory.
//
// The push-token mutations invalidate **nothing**, deliberately: a registration
// is device state that no query reads. Their empty matrix rows are asserted, so
// "we decided there is nothing" stays distinguishable from "nobody looked".

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type {
  MarkNotificationsReadData,
  MarkNotificationsReadResponse,
  RegisterPushTokenData,
  RegisterPushTokenResponse,
} from '@fit/types';
import {
  markNotificationsRead,
  registerPushToken,
  unregisterPushToken,
} from '../../lib/api/notifications';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `POST /notifications/mark-read`. */
export function markNotificationsReadMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<MarkNotificationsReadResponse, Error, MarkNotificationsReadData | void> {
  return {
    mutationKey: ['markNotificationsRead'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Marking notifications read');
      return markNotificationsRead(input ?? {});
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Marking notifications read'),
        'markNotificationsRead',
      );
    },
  };
}

/**
 * Mark specific notifications read, or **all** unread when called with no
 * argument. Idempotent — unknown and already-read ids are ignored.
 */
export function useMarkNotificationsRead() {
  return useMutation(markNotificationsReadMutationOptions(useMutationDeps()));
}

/** `POST /notifications/push-token`. */
export function registerPushTokenMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<RegisterPushTokenResponse, Error, RegisterPushTokenData> {
  return {
    mutationKey: ['registerPushToken'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Registering for push');
      return registerPushToken(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Registering for push'),
        'registerPushToken',
      );
    },
  };
}

/**
 * Register this install's Expo push token.
 *
 * Upserted on `(userId, deviceId)`, so calling it again after a token rotation
 * updates the row rather than leaving a dead delivery target behind.
 */
export function useRegisterPushToken() {
  return useMutation(registerPushTokenMutationOptions(useMutationDeps()));
}

/** `DELETE /notifications/push-token/:deviceId`. */
export function unregisterPushTokenMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<void, Error, { deviceId: string }> {
  return {
    mutationKey: ['unregisterPushToken'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Unregistering push');
      return unregisterPushToken(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Unregistering push'),
        'unregisterPushToken',
      );
    },
  };
}

/**
 * Stop push delivery to this install.
 *
 * Sign-out calls this **before** `POST /auth/logout` — the access token is what
 * authorizes it — but WP-4 owns that sequencing (`lib/auth/session.ts`); this is
 * the hook a settings screen uses.
 */
export function useUnregisterPushToken() {
  return useMutation(unregisterPushTokenMutationOptions(useMutationDeps()));
}
