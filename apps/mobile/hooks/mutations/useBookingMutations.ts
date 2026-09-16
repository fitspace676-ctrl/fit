// @fit/mobile — book and cancel a class.
//
// Neither is optimistic. Booking is a *contended* write: whether the caller gets
// a seat or a waitlist place depends on who else pressed the button in the same
// second, and the response's `capacity` / `bookedCount` / `waitlistPosition` are
// the answer. A client that guessed "BOOKED" would render a seat for the ~200ms
// before the server said "WAITLIST, position 4" — the one case where an
// optimistic update is a lie about scarcity rather than a latency hide.

import { useMutation, type UseMutationOptions } from '@tanstack/react-query';
import type { BookClassInstanceResponse, CancelBookingResponse } from '@fit/types';
import { bookClass, cancelBooking, type BookClassInput } from '../../lib/api/bookings';
import { invalidateFor } from './invalidation';
import { requireGymId, useMutationDeps, type MutationDeps } from './deps';

/** `POST /class-instances/:id/bookings`. */
export function bookClassMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<BookClassInstanceResponse, Error, BookClassInput> {
  return {
    mutationKey: ['bookClass'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Booking a class');
      return bookClass(input);
    },
    onSuccess: () => {
      invalidateFor(deps.queryClient, requireGymId(deps.gymId, 'Booking a class'), 'bookClass');
    },
  };
}

/**
 * Book a class occurrence, or join its waitlist.
 *
 * Pass an `idempotencyKey` minted once per *attempt* (not per retry) whenever
 * the caller might retry: without one, a retried POST takes a second seat and
 * spends a second class credit.
 */
export function useBookClass() {
  return useMutation(bookClassMutationOptions(useMutationDeps()));
}

/** `DELETE /class-instances/:id/bookings`. */
export function cancelBookingMutationOptions(
  deps: MutationDeps,
): UseMutationOptions<CancelBookingResponse, Error, { classId: string }> {
  return {
    mutationKey: ['cancelBooking'],
    mutationFn: (input) => {
      requireGymId(deps.gymId, 'Cancelling a booking');
      return cancelBooking(input);
    },
    onSuccess: () => {
      invalidateFor(
        deps.queryClient,
        requireGymId(deps.gymId, 'Cancelling a booking'),
        'cancelBooking',
      );
    },
  };
}

/**
 * Release the caller's seat.
 *
 * `409 CANCELLATION_WINDOW_PASSED` is the failure a screen must render
 * specially: the gym's cutoff has passed, so the seat is not released *and* the
 * credit is not refunded.
 */
export function useCancelBooking() {
  return useMutation(cancelBookingMutationOptions(useMutationDeps()));
}
