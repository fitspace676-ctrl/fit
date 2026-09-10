// @fit/mobile — the book / cancel flow, shared by the list and the detail.
//
// ===========================================================================
// ONE FLOW, TWO SCREENS, ZERO DUPLICATION.
//
// The classes list offers the action on every card and the detail offers it in
// a sticky bar; both open the same `ConfirmSheet`, both write through the same
// two mutations, both map the same error codes and both show the same toast.
// Built twice, they are the deleted app's two tab bars again — and worse here,
// because the two copies would eventually disagree about whether a member is
// booked.
//
// ---------------------------------------------------------------------------
// FOUR THINGS THIS OWNS THAT ARE EASY TO GET WRONG.
//
//   1. THE AUTH-SOFT BOUNDARY IS THE CTA, NOT THE ROUTE. `/classes` is
//      `public` and `/classes/[id]` is `auth-soft`: a signed-out visitor sees
//      the whole schedule and meets the wall only when they press Book. So
//      `request()` is where the sign-in prompt lives, and it hands the route
//      guard a `next=` that returns the member to the CLASS they pressed on —
//      not to the tab they happened to be looking at.
//
//   2. THE IDEMPOTENCY KEY IS PER *ATTEMPT*, NOT PER PRESS. `POST
//      /class-instances/:id/bookings` takes it as a HEADER and answers 200 on a
//      replay. A key minted per press means a member whose first POST timed out
//      — but succeeded — takes a second seat AND spends a second class credit
//      on the retry. So the key is minted when the sheet opens for a class and
//      held until that attempt resolves.
//
//   3. NOTHING IS OPTIMISTIC, AND NOTHING REFETCHES. Whether a press yields a
//      seat or a waitlist place is decided by whoever else pressed in the same
//      second, so the server's answer is the only truth
//      (`useBookingMutations.ts`). The refresh is the invalidation matrix's —
//      `bookClass` / `cancelBooking` both fan out to classes + bookings +
//      creditPacks — never a `.refetch()` here.
//
//   4. A FROZEN MEMBERSHIP IS A STATE, NOT AN ERROR. See `booking-errors.ts`.
//
// The success toast reads `classes.detail.booking.toast.*` on BOTH screens.
// D10 puts the list on `member.classes`, but that namespace has no toast block
// at all (`member.actions.canceled` is its one outcome string, and there is no
// "booked" sibling), so the only complete set is the detail's. Flagged in the
// report rather than half-translated across two namespaces.
// ===========================================================================

import { useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { useToast, type ClassCardStatus } from '@fit/ui-mobile';

import { useBookClass, useCancelBooking } from '../../hooks/mutations/useBookingMutations';
import { useSession } from '../../hooks/useSession';
import type { MessageKey } from '../../lib/i18n/keys';
import { useI18n } from '../../providers/I18nProvider';
import { bookingErrorKey, isSubscriptionFrozen } from './booking-errors';

/** The class an open confirm sheet is about. */
export interface BookingTarget {
  readonly id: string;
  readonly title: string;
  readonly startsAt: string;
  readonly trainerName: string;
  readonly locationName: string;
  readonly capacity: number;
  readonly bookedCount: number;
  /** The member's current booking state — decides book vs cancel. */
  readonly status: ClassCardStatus;
}

/** A failure the screen has to draw. */
export interface BookingFailure {
  /** A real, translated sentence from `member.actions.err*`. */
  readonly messageKey: MessageKey;
  /** The 403 `SUBSCRIPTION_FROZEN` refusal — its own state, see the module head. */
  readonly frozen: boolean;
}

/** What {@link useClassBooking} hands a screen. */
export interface ClassBooking {
  /** The class the sheet is about, or `null` when it is closed. */
  readonly target: BookingTarget | null;
  /** Is a write in flight? */
  readonly busy: boolean;
  /** The id of the class being written, so one card can show `busy` and the rest cannot. */
  readonly pendingId: string | null;
  /** The last failure, until the member acts again. */
  readonly failure: BookingFailure | null;
  /** Press the CTA. Signed out, this navigates to sign-in instead of opening. */
  request: (target: BookingTarget) => void;
  /** Confirm the sheet's action. */
  confirm: () => void;
  /** Dismiss the sheet without acting. */
  dismiss: () => void;
}

/**
 * A monotonically increasing suffix, so two attempts in the same millisecond
 * cannot mint the same key. Module scope rather than a ref: two screens can be
 * mounted at once (the list under a pushed detail) and the keys must not
 * collide across them either.
 */
let attemptSeq = 0;

function mintIdempotencyKey(classId: string): string {
  attemptSeq += 1;
  // Well inside `idempotencyKeySchema`'s 200-character ceiling.
  return `${classId}:${String(Date.now())}:${String(attemptSeq)}`;
}

/** Where sign-in should return a member who pressed Book on `classId`. */
export function bookingSignInHref(classId: string): string {
  return `/login?next=${encodeURIComponent(`/classes/${classId}`)}`;
}

/**
 * The book / cancel flow.
 *
 * Holds exactly one target at a time, which is also what keeps `Sheet`'s
 * single-instance-per-screen rule satisfiable: a screen renders one
 * `ConfirmSheet` bound to `target !== null`.
 */
export function useClassBooking(): ClassBooking {
  const router = useRouter();
  const toast = useToast();
  const { t } = useI18n();
  const session = useSession();

  const book = useBookClass();
  const cancel = useCancelBooking();

  const [target, setTarget] = useState<BookingTarget | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [failure, setFailure] = useState<BookingFailure | null>(null);

  // The attempt's key, and the class it belongs to.
  //
  // Minted once per class and cleared only on SUCCESS — deliberately not per
  // press. A member whose first POST timed out (but landed) and who presses
  // Book again must send the SAME key, or the replay protection does nothing
  // and they take a second seat and spend a second class credit. Pressing Book
  // on a different class mints a new one, because that is a different attempt.
  const attempt = useRef<{ classId: string; key: string } | null>(null);

  const request = useCallback(
    (next: BookingTarget) => {
      setFailure(null);
      if (session.status !== 'signed-in') {
        router.push(bookingSignInHref(next.id));
        return;
      }
      if (attempt.current?.classId !== next.id) {
        attempt.current = { classId: next.id, key: mintIdempotencyKey(next.id) };
      }
      setTarget(next);
    },
    [router, session.status],
  );

  const dismiss = useCallback(() => {
    // A write in flight must not be dismissable: a sheet that vanishes
    // mid-request leaves the member with no idea whether they have a seat.
    if (pendingId !== null) return;
    setTarget(null);
  }, [pendingId]);

  /**
   * Both outcomes close the sheet.
   *
   * On success because the sheet has said everything it can and the outcome
   * lives in the toast and in the re-rendered card; on failure because the
   * error's two possible next actions — "try again" and "manage your frozen
   * plan" — are on the SCREEN, and a sheet is the wrong place to offer a route
   * out of itself.
   */
  const settle = useCallback((next: BookingFailure | null) => {
    setPendingId(null);
    setTarget(null);
    setFailure(next);
  }, []);

  const onFailure = useCallback(
    (error: unknown) => {
      settle({
        messageKey: bookingErrorKey(error),
        frozen: isSubscriptionFrozen(error),
      });
    },
    [settle],
  );

  const confirm = useCallback(() => {
    if (target === null || pendingId !== null) return;
    const { id, status } = target;
    setPendingId(id);
    setFailure(null);

    if (status === null) {
      const key = attempt.current?.key ?? null;
      book.mutate(
        { classId: id, ...(key === null ? {} : { idempotencyKey: key }) },
        {
          onSuccess: (result) => {
            attempt.current = null;
            settle(null);
            toast.success(
              t(
                result.status === 'WAITLIST'
                  ? 'classes.detail.booking.toast.waitlisted'
                  : 'classes.detail.booking.toast.booked',
              ),
            );
          },
          onError: onFailure,
        },
      );
      return;
    }

    const wasWaitlisted = status === 'WAITLIST';
    cancel.mutate(
      { classId: id },
      {
        onSuccess: () => {
          attempt.current = null;
          settle(null);
          toast.success(
            t(
              wasWaitlisted
                ? 'classes.detail.booking.toast.leftWaitlist'
                : 'classes.detail.booking.toast.canceled',
            ),
          );
        },
        onError: onFailure,
      },
    );
  }, [book, cancel, onFailure, pendingId, settle, t, target, toast]);

  return {
    target,
    busy: pendingId !== null,
    pendingId,
    failure,
    request,
    confirm,
    dismiss,
  };
}
