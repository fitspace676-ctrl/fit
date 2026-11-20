import { BookingStatus } from '@fit/db';
import type {
  CreditPacksService,
  CreditPackTransactionClient,
} from '../billing/credit-packs.service';

/** Shared seat/queue release; caller owns the transaction and policy gates. */
export async function releaseBooking(
  tx: CreditPackTransactionClient,
  creditPacks: CreditPacksService,
  classInstanceId: string,
  booking: {
    id: string;
    status: BookingStatus;
    waitlistPosition: number | null;
    creditPackId: string | null;
  },
  gymId?: string,
): Promise<string | null> {
  const scope = gymId ? { gymId } : {};
  // Close the gap a departing queue entry leaves so the remaining waitlist
  // keeps contiguous 1..N positions. A no-op when the vacated slot is null
  // (a confirmed seat carries no queue position).
  const closeWaitlistGap = async (vacatedPosition: number | null) => {
    if (vacatedPosition === null) {
      return;
    }
    await tx.booking.updateMany({
      where: {
        ...scope,
        classInstanceId,
        status: BookingStatus.WAITLIST,
        waitlistPosition: { gt: vacatedPosition },
      },
      data: { waitlistPosition: { decrement: 1 } },
    });
  };

  // Release the member's hold. Flipping to CANCELED (and clearing any queue
  // slot) drops the row out of the active partial unique immediately, so the
  // same member can re-book or re-join the waitlist right after.
  await tx.booking.update({
    where: { ...scope, id: booking.id },
    data: { status: BookingStatus.CANCELED, waitlistPosition: null },
  });

  // Refund the class credit this seat was paid for (T8.5) back to its pack.
  // The caller has applied its cancellation policy (member cutoff or automatic
  // block). This is a no-op for a
  // subscription-covered or uncharged seat (`creditPackId` is null) and for a
  // waitlist entry (which never held a seat to charge).
  if (booking.status === BookingStatus.BOOKED) {
    await creditPacks.refundCredit(tx, booking.creditPackId, ...(gymId ? [gymId] : []));
  }

  let promotedBookingId: string | null = null;

  if (booking.status === BookingStatus.BOOKED) {
    // A confirmed seat just opened — give it to the head of the queue.
    for (;;) {
      const next = await tx.booking.findFirst({
        where: { ...scope, classInstanceId, status: BookingStatus.WAITLIST },
        orderBy: { waitlistPosition: 'asc' },
        select: { id: true, waitlistPosition: true, memberId: true },
      });
      if (!next) {
        // No one waiting — give the seat back to the pool (never below 0).
        await tx.classInstance.updateMany({
          where: { ...scope, id: classInstanceId, bookedCount: { gt: 0 } },
          data: { bookedCount: { decrement: 1 } },
        });
        break;
      }
      // Conditional claim guarded on `status = WAITLIST`: a concurrent
      // cancellation that already promoted this entry yields count 0, so we
      // retry against the new head rather than double-promoting it.
      const claimed = await tx.booking.updateMany({
        where: { ...scope, id: next.id, status: BookingStatus.WAITLIST },
        data: { status: BookingStatus.BOOKED, waitlistPosition: null },
      });
      if (claimed.count === 1) {
        // The promoted member now holds a seat, so they pay a class credit too
        // (T8.5) — best-effort (`required: false`): a member out of credits is
        // never blocked from a seat that just freed up (refusing would unfairly
        // penalise them for another member's cancellation), so the seat is
        // granted uncharged. The pack charged (if any) is recorded for their
        // own later cancellation refund.
        const promotedPackId = await creditPacks.chargeSeatCredit(tx, next.memberId, {
          required: false,
          ...(gymId ? { gymId } : {}),
        });
        if (promotedPackId) {
          await tx.booking.update({
            where: { ...scope, id: next.id },
            data: { creditPackId: promotedPackId },
          });
        }
        promotedBookingId = next.id;
        await closeWaitlistGap(next.waitlistPosition);
        break;
      }
    }
  } else {
    // A waitlisted member left the queue — no seat held, just close the gap.
    await closeWaitlistGap(booking.waitlistPosition);
  }

  return promotedBookingId;
}
