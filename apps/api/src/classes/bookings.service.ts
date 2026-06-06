import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BookingStatus, InstanceStatus, Prisma } from '@fit/db';
import {
  gymSettingsStoredSchema,
  type BookClassInstanceResult,
  type CancelBookingResult,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The booking columns a result is projected from (the parent occurrence's seat
 * figures are read separately so a replay reflects the live counts). */
const BOOKING_SELECT = {
  id: true,
  classInstanceId: true,
  memberId: true,
  status: true,
  waitlistPosition: true,
} satisfies Prisma.BookingSelect;

type BookingRecord = Prisma.BookingGetPayload<{ select: typeof BOOKING_SELECT }>;

/** The occurrence fields the capacity gate, the cancellation policy, and the
 * result projection need. `startsAt` drives the cancellation cutoff (T5.6). */
const INSTANCE_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  bookedCount: true,
  capacityOverride: true,
  template: { select: { capacity: true } },
} satisfies Prisma.ClassInstanceSelect;

/**
 * Member-facing class booking (T5.4).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `classInstance`
 * / `booking` / `gymMember` query is auto-constrained to the caller's gym by the
 * Prisma tenant extension, so a member can only ever book occurrences in their own
 * gym — there is no `gymId` to pass or to forget. The member books *themselves*:
 * the caller's gym membership (resolved from the session's user id) is the
 * booking's `memberId`, never a value off the wire.
 *
 * Two correctness properties the booking flow must hold, both enforced here:
 *
 * - **No overbooking under concurrency.** The seat is claimed with a single
 *   conditional `updateMany` that increments `bookedCount` only `WHERE
 *   bookedCount < capacity`; the database evaluates that predicate atomically
 *   against the current row, so two simultaneous requests for the last seat can
 *   never both succeed — the loser is queued onto the waitlist instead. The
 *   denormalised counter (never a `COUNT(*)`) is what lets a card show remaining
 *   spots without a join, so it is bumped in the same transaction as the insert.
 *
 * - **Idempotent retries.** A client may send an `Idempotency-Key`; it is stored
 *   on the booking under a unique index, so a retried POST (network blip, double
 *   tap) returns the original booking rather than creating a second seat / second
 *   waitlist entry. A concurrent duplicate that slips past the pre-check is caught
 *   on the unique-violation and replayed the same way.
 */
@Injectable()
export class BookingsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * Book the calling member into a scheduled class occurrence (or queue them onto
   * its waitlist when it is full). Resolves the caller's own gym membership as the
   * booking's member, then:
   *
   * 1. **Idempotent replay** — if `idempotencyKey` was supplied and already maps to
   *    a booking, that booking is returned unchanged (no second seat). A key that
   *    maps to a *different* member/occurrence is a `409 IDEMPOTENCY_KEY_REUSED`.
   * 2. **The booking transaction** — load the occurrence (`404` if unknown /
   *    cross-tenant, `409 CLASS_NOT_BOOKABLE` if not `SCHEDULED`); reject a member
   *    who already holds a live booking (`409 ALREADY_BOOKED`); claim a seat with
   *    the atomic capacity gate, or compute the next waitlist position; insert the
   *    booking with its idempotency key. A unique-violation race is mapped back to
   *    a replay (same key) or `409 ALREADY_BOOKED` (same member).
   */
  async book(classInstanceId: string, idempotencyKey?: string): Promise<BookClassInstanceResult> {
    const memberId = await this.requireCallerMembership();

    if (idempotencyKey) {
      const existing = await this.findByIdempotencyKey(idempotencyKey);
      if (existing) {
        return this.replay(existing, memberId, classInstanceId);
      }
    }

    const key = idempotencyKey ?? randomUUID();

    try {
      return await this.prisma.client.$transaction(async (tx) => {
        const instance = await tx.classInstance.findFirst({
          where: { id: classInstanceId },
          select: INSTANCE_SELECT,
        });
        if (!instance) {
          throw this.instanceNotFound();
        }
        if (instance.status !== InstanceStatus.SCHEDULED) {
          throw new ConflictException({
            message: 'This class is no longer open for booking',
            code: 'CLASS_NOT_BOOKABLE',
          });
        }

        const live = await tx.booking.findFirst({
          where: { classInstanceId, memberId, status: { not: BookingStatus.CANCELED } },
          select: { id: true },
        });
        if (live) {
          throw this.alreadyBooked();
        }

        const capacity = instance.capacityOverride ?? instance.template.capacity;

        // Atomic seat claim: the increment runs only while there is room, and the
        // DB evaluates `bookedCount < capacity` against the live row — so the last
        // seat can be taken by exactly one of N concurrent requests.
        const seated = await tx.classInstance.updateMany({
          where: {
            id: classInstanceId,
            status: InstanceStatus.SCHEDULED,
            bookedCount: { lt: capacity },
          },
          data: { bookedCount: { increment: 1 } },
        });
        const booked = seated.count === 1;

        let waitlistPosition: number | null = null;
        if (!booked) {
          const tail = await tx.booking.aggregate({
            where: { classInstanceId, status: BookingStatus.WAITLIST },
            _max: { waitlistPosition: true },
          });
          waitlistPosition = (tail._max.waitlistPosition ?? 0) + 1;
        }

        const booking = await tx.booking.create({
          data: {
            gymId: this.tenant.gymId,
            classInstanceId,
            memberId,
            status: booked ? BookingStatus.BOOKED : BookingStatus.WAITLIST,
            waitlistPosition,
            idempotencyKey: key,
          },
          select: { id: true },
        });

        // Re-read the (post-increment) counter so the response reflects the true
        // live total even when other bookings landed concurrently.
        const after = await tx.classInstance.findFirst({
          where: { id: classInstanceId },
          select: { bookedCount: true },
        });

        return {
          bookingId: booking.id,
          classInstanceId,
          status: booked ? BookingStatus.BOOKED : BookingStatus.WAITLIST,
          waitlistPosition,
          capacity,
          bookedCount: after?.bookedCount ?? instance.bookedCount,
          idempotentReplay: false,
        };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const target = violatedTarget(error);
        // Same idempotency key won the race — replay its booking (the increment
        // this attempt may have done was rolled back when the insert threw).
        if (idempotencyKey && target.includes('idempotencyKey')) {
          const existing = await this.findByIdempotencyKey(idempotencyKey);
          if (existing) {
            return this.replay(existing, memberId, classInstanceId);
          }
        }
        // Otherwise the member already holds a live booking (the partial unique on
        // (classInstanceId, memberId) WHERE status != CANCELED fired concurrently).
        throw this.alreadyBooked();
      }
      throw error;
    }
  }

  /**
   * Cancel the calling member's booking for an occurrence and, when a confirmed
   * seat is released, auto-promote the head of the waitlist into it (T5.5).
   *
   * Runs in one interactive transaction so the seat accounting stays consistent
   * under concurrency:
   *
   * - **Releasing a confirmed seat** hands it to the lowest-positioned waitlisted
   *   member. The promotion is a *transfer*: the conditional update flips that
   *   entry to `BOOKED` while `bookedCount` stays put (one seat freed, one
   *   immediately re-filled). The claim is guarded on `status = WAITLIST` and
   *   retried against the new head if it loses a race, so two seats freeing at
   *   once promote two *distinct* members, never the same one twice. With an
   *   empty queue the seat is given back to the pool (`bookedCount` decremented,
   *   floored at 0).
   * - **Leaving the waitlist** holds no seat, so `bookedCount` is untouched; the
   *   gap behind the departing member is closed so the displayed queue positions
   *   stay a contiguous `1..N`.
   *
   * **Policy (T5.6).** Releasing a *confirmed* seat is gated by the gym's
   * cancellation cutoff (`booking.cancellationCutoffHours` in its settings): once
   * the occurrence starts within that window the seat can no longer be freed —
   * too late for the queue to take it up — so the cancel is rejected with `409
   * CANCELLATION_WINDOW_PASSED`. The cutoff applies only to a held seat; leaving
   * the waitlist is always allowed, and a `0` cutoff (the default) disables it.
   *
   * Failure modes mirror {@link book}: `404` for an unknown / cross-tenant
   * occurrence, `409 BOOKING_NOT_CANCELABLE` once the occurrence is no longer
   * `SCHEDULED` (canceled / completed), `404 BOOKING_NOT_FOUND` when the caller
   * holds no live booking for it, and `409 CANCELLATION_WINDOW_PASSED` when a
   * confirmed seat is released inside the cutoff window.
   */
  async cancel(classInstanceId: string): Promise<CancelBookingResult> {
    const memberId = await this.requireCallerMembership();

    return this.prisma.client.$transaction(async (tx) => {
      const instance = await tx.classInstance.findFirst({
        where: { id: classInstanceId },
        select: INSTANCE_SELECT,
      });
      if (!instance) {
        throw this.instanceNotFound();
      }
      if (instance.status !== InstanceStatus.SCHEDULED) {
        throw new ConflictException({
          message: 'This class can no longer be modified',
          code: 'BOOKING_NOT_CANCELABLE',
        });
      }

      const booking = await tx.booking.findFirst({
        where: { classInstanceId, memberId, status: { not: BookingStatus.CANCELED } },
        select: { id: true, status: true, waitlistPosition: true },
      });
      if (!booking) {
        throw this.bookingNotFound();
      }

      // Policy gate (T5.6): a *confirmed* seat can't be released inside the gym's
      // cancellation cutoff window — by then it is too late for the waitlist to
      // pick it up. A waitlist entry holds no seat, so it is always free to leave.
      // `Gym` is the tenant root (keyed by `id`, outside the tenant extension's
      // scoped set), so the row is pinned explicitly to the caller's own gym via
      // `tenant.gymId`, taken from the verified session.
      if (booking.status === BookingStatus.BOOKED) {
        const gym = await tx.gym.findFirst({
          where: { id: this.tenant.gymId },
          select: { settings: true },
        });
        const { cancellationCutoffHours } = gymSettingsStoredSchema.parse(
          gym?.settings ?? {},
        ).booking;
        this.assertWithinCancellationWindow(cancellationCutoffHours, instance.startsAt);
      }

      // Close the gap a departing queue entry leaves so the remaining waitlist
      // keeps contiguous 1..N positions. A no-op when the vacated slot is null
      // (a confirmed seat carries no queue position).
      const closeWaitlistGap = async (vacatedPosition: number | null) => {
        if (vacatedPosition === null) {
          return;
        }
        await tx.booking.updateMany({
          where: {
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
        where: { id: booking.id },
        data: { status: BookingStatus.CANCELED, waitlistPosition: null },
      });

      let promotedBookingId: string | null = null;

      if (booking.status === BookingStatus.BOOKED) {
        // A confirmed seat just opened — give it to the head of the queue.
        for (;;) {
          const next = await tx.booking.findFirst({
            where: { classInstanceId, status: BookingStatus.WAITLIST },
            orderBy: { waitlistPosition: 'asc' },
            select: { id: true, waitlistPosition: true },
          });
          if (!next) {
            // No one waiting — give the seat back to the pool (never below 0).
            await tx.classInstance.updateMany({
              where: { id: classInstanceId, bookedCount: { gt: 0 } },
              data: { bookedCount: { decrement: 1 } },
            });
            break;
          }
          // Conditional claim guarded on `status = WAITLIST`: a concurrent
          // cancellation that already promoted this entry yields count 0, so we
          // retry against the new head rather than double-promoting it.
          const claimed = await tx.booking.updateMany({
            where: { id: next.id, status: BookingStatus.WAITLIST },
            data: { status: BookingStatus.BOOKED, waitlistPosition: null },
          });
          if (claimed.count === 1) {
            promotedBookingId = next.id;
            await closeWaitlistGap(next.waitlistPosition);
            break;
          }
        }
      } else {
        // A waitlisted member left the queue — no seat held, just close the gap.
        await closeWaitlistGap(booking.waitlistPosition);
      }

      // Re-read the (possibly decremented) counter so the response reflects the
      // true live total even when other bookings landed concurrently.
      const after = await tx.classInstance.findFirst({
        where: { id: classInstanceId },
        select: { bookedCount: true },
      });

      return {
        bookingId: booking.id,
        classInstanceId,
        status: BookingStatus.CANCELED,
        promotedBookingId,
        capacity: instance.capacityOverride ?? instance.template.capacity,
        bookedCount: after?.bookedCount ?? instance.bookedCount,
      };
    });
  }

  /**
   * Resolve the calling user's membership in the current gym — the booking's
   * `memberId`. The session must carry a user (`@RequirePermissions(ClassBook)`
   * guarantees an authenticated caller), and that user must be a member of this
   * gym; a non-member (e.g. a stray cross-tenant identity) is a `403`.
   */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required to book a class',
        code: 'MEMBER_SESSION_REQUIRED',
      });
    }
    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { id: true },
    });
    if (!member) {
      throw new ForbiddenException({
        message: 'You are not a member of this gym',
        code: 'NOT_A_MEMBER',
      });
    }
    return member.id;
  }

  /**
   * Reject releasing a confirmed seat inside the gym's cancellation cutoff (T5.6).
   * A `0` cutoff (the default for a never-configured gym) disables the rule.
   * Otherwise, once the occurrence starts within `cutoffHours` of now the seat is
   * released too late for the waitlist to take it up, so the cancellation is a
   * `409 CANCELLATION_WINDOW_PASSED`.
   */
  private assertWithinCancellationWindow(cutoffHours: number, startsAt: Date): void {
    if (cutoffHours <= 0) {
      return;
    }
    const cutoff = new Date(startsAt.getTime() - cutoffHours * 60 * 60 * 1000);
    if (new Date() >= cutoff) {
      throw new ConflictException({
        message: `Bookings can no longer be cancelled within ${cutoffHours} hours of the class start`,
        code: 'CANCELLATION_WINDOW_PASSED',
      });
    }
  }

  /** The booking a (tenant-scoped) idempotency key maps to, if any. */
  private findByIdempotencyKey(idempotencyKey: string): Promise<BookingRecord | null> {
    return this.prisma.client.booking.findFirst({
      where: { idempotencyKey },
      select: BOOKING_SELECT,
    });
  }

  /**
   * Return an existing booking as an idempotent replay. The key must map to *this*
   * member's booking for *this* occurrence — a key reused for a different request
   * is a `409 IDEMPOTENCY_KEY_REUSED` so a client bug can't silently shadow an
   * unrelated booking.
   */
  private async replay(
    booking: BookingRecord,
    memberId: string,
    classInstanceId: string,
  ): Promise<BookClassInstanceResult> {
    if (booking.memberId !== memberId || booking.classInstanceId !== classInstanceId) {
      throw new ConflictException({
        message: 'This idempotency key was already used for a different booking',
        code: 'IDEMPOTENCY_KEY_REUSED',
      });
    }
    const instance = await this.prisma.client.classInstance.findFirst({
      where: { id: booking.classInstanceId },
      select: INSTANCE_SELECT,
    });
    const capacity = instance ? (instance.capacityOverride ?? instance.template.capacity) : 0;
    return {
      bookingId: booking.id,
      classInstanceId: booking.classInstanceId,
      status:
        booking.status === BookingStatus.WAITLIST ? BookingStatus.WAITLIST : BookingStatus.BOOKED,
      waitlistPosition: booking.waitlistPosition,
      capacity,
      bookedCount: instance?.bookedCount ?? 0,
      idempotentReplay: true,
    };
  }

  /** `404` for an unknown / cross-tenant occurrence id. */
  private instanceNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'Class occurrence not found',
      code: 'CLASS_INSTANCE_NOT_FOUND',
    });
  }

  /** `409` when the member already holds a live (non-canceled) booking. */
  private alreadyBooked(): ConflictException {
    return new ConflictException({
      message: 'You already have a booking for this class',
      code: 'ALREADY_BOOKED',
    });
  }

  /** `404` when the caller holds no live booking to cancel for the occurrence. */
  private bookingNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'You do not have a booking for this class',
      code: 'BOOKING_NOT_FOUND',
    });
  }
}

/**
 * The unique-constraint columns/index name a Prisma `P2002` reports. Postgres
 * surfaces a partial unique index by its name and an ordinary one by its fields,
 * so callers match on a substring (e.g. `idempotencyKey`) rather than an exact
 * shape.
 */
function violatedTarget(error: Prisma.PrismaClientKnownRequestError): string {
  const target = error.meta?.target;
  if (Array.isArray(target)) {
    return target.filter((t): t is string => typeof t === 'string').join(',');
  }
  return typeof target === 'string' ? target : '';
}
