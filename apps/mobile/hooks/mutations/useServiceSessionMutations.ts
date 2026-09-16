// @fit/mobile — booking a personal-training slot.
//
// Three caches move, and the third is the one worth writing down: the booking
// **raises an invoice**, and the member's invoice history is part of
// `GET /me/subscription` — i.e. `queryKeys.membership(gymId)`, not some separate
// invoices key. A billing screen that only invalidated the session list would
// show the session booked and no charge against it.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { BookServiceSessionResult } from '@fit/types';
import { bookServiceSession } from '../../lib/api/service-sessions';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `POST /me/service-sessions/:id/book`. */
export function bookServiceSessionMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<BookServiceSessionResult, Error, { sessionId: string }> {
  return {
    mutationKey: ['bookServiceSession'],
    // Contended and billable: a retry can claim a second slot and raise a second
    // invoice.
    retry: false,
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Booking a session');
      return bookServiceSession(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Booking a session'),
        'bookServiceSession',
      );
    },
  };
}

/**
 * Claim an OPEN slot.
 *
 * Not optimistic: like a class booking, whether the slot is still free is
 * decided by whoever pressed first, and the response is the answer.
 */
export function useBookServiceSession() {
  return useMutation(bookServiceSessionMutationOptions(useMutationDeps()));
}
