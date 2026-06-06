import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BookingStatus, InstanceStatus, Prisma } from '@fit/db';
import type { BookClassInstanceResult } from '@fit/types';
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

/** The occurrence fields the capacity gate and the result projection need. */
const INSTANCE_SELECT = {
  id: true,
  status: true,
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
