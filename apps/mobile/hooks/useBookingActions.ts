// @fit/mobile — the book / waitlist / cancel mutations for one occurrence.
//
// Pairs the class-detail screen's actions (T6.4) with TanStack Query mutations
// that keep the cache honest: after a successful book or cancel the occurrence's
// seat totals and the member's bookings have changed, so both mutations
// invalidate the detail query, the member-bookings query, and the week-listing
// query. The screen re-reads those automatically and repaints (Book → Cancel,
// updated spots-left) with no manual state juggling.
//
// `book` mints a fresh `Idempotency-Key` (a UUID) per attempt so a network
// retry of the same logical booking can't take a second seat. Mutations don't
// retry by default, which is what we want here — a booking is not safe to fire
// twice without the caller's intent, and the idempotency key is the backstop for
// the cases where it does.

import { randomUUID } from 'expo-crypto';
import { useMutation, useQueryClient, type UseMutationResult } from '@tanstack/react-query';
import type { BookClassInstanceResult, CancelBookingResult } from '@fit/types';
import { bookClassInstance, cancelBooking } from '../lib/bookings';

export interface BookingActions {
  /** Book a seat (or queue on the waitlist when full). */
  book: UseMutationResult<BookClassInstanceResult, Error, void>;
  /** Cancel the live booking (release the seat or leave the waitlist). */
  cancel: UseMutationResult<CancelBookingResult, Error, void>;
}

/**
 * Book / cancel mutations for occurrence `instanceId`, scoped to `gymId` for
 * cache invalidation. Both mutations invalidate the occurrence detail, the
 * member's bookings, and the week listing on success, so every surface showing
 * this class re-syncs. Returns the two raw mutation objects so the screen can
 * read `isPending` to disable buttons and `mutateAsync` to await + toast.
 */
export function useBookingActions(gymId: string | null, instanceId: string): BookingActions {
  const queryClient = useQueryClient();

  // Refresh everything that reflects this occurrence's seat counts or the
  // member's booking state. Errors from a stale-cache action (e.g. a 409) also
  // re-sync via this, so the UI corrects itself either way.
  const invalidate = (): Promise<void> => {
    void queryClient.invalidateQueries({ queryKey: ['class-instance', gymId, instanceId] });
    void queryClient.invalidateQueries({ queryKey: ['member-bookings', gymId] });
    void queryClient.invalidateQueries({ queryKey: ['class-instances', gymId] });
    return Promise.resolve();
  };

  const book = useMutation<BookClassInstanceResult, Error, void>({
    mutationFn: () => bookClassInstance(instanceId, randomUUID()),
    onSettled: invalidate,
  });

  const cancel = useMutation<CancelBookingResult, Error, void>({
    mutationFn: () => cancelBooking(instanceId),
    onSettled: invalidate,
  });

  return { book, cancel };
}
