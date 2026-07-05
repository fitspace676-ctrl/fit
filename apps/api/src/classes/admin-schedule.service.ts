import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { BookingStatus, InstanceStatus, Prisma, SubscriptionStatus } from '@fit/db';
import type {
  AdminClassInstanceDetail,
  AdminClassInstanceRosterEntry,
  AdminRosterBookingStatus,
  AdminScheduleInstance,
  AdminScheduleQuery,
  AdminScheduleResponse,
} from '@fit/types';
import { CreditPacksService } from '../billing/credit-packs.service';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { ClassOccupancyPublisher } from './class-occupancy.publisher';

/**
 * The occurrence + template columns the week calendar projects. The instance
 * carries the resolved instants, per-occurrence capacity override, denormalised
 * `bookedCount`, and lifecycle `status`; the template supplies the display fields
 * (title/category/colour/room) and the seat/duration figures plus the default
 * trainer / location names a calendar block shows without a second query.
 */
const SCHEDULE_SELECT = {
  id: true,
  templateId: true,
  startsAt: true,
  endsAt: true,
  capacityOverride: true,
  bookedCount: true,
  status: true,
  template: {
    select: {
      title: true,
      category: true,
      color: true,
      room: true,
      capacity: true,
      durationMinutes: true,
      trainer: { select: { name: true } },
      location: { select: { name: true } },
    },
  },
} satisfies Prisma.ClassInstanceSelect;

type ScheduleRow = Prisma.ClassInstanceGetPayload<{ select: typeof SCHEDULE_SELECT }>;

/**
 * The live booking statuses that make up a class occurrence's drawer roster
 * (T3.3): held seats (`BOOKED`, and the post-class `ATTENDED` / `NO_SHOW`
 * outcomes) plus the `WAITLIST` queue. A `CANCELED` booking released its hold, so
 * it is excluded — the roster is who is (or was) actually coming.
 */
const ROSTER_STATUSES = [
  BookingStatus.BOOKED,
  BookingStatus.WAITLIST,
  BookingStatus.ATTENDED,
  BookingStatus.NO_SHOW,
] as const;

/** A roster booking joined to the (cross-tenant) member identity. Kept narrow —
 * only the `name` / `email` needed to identify the person, the queue position,
 * and the booking time for a stable order. */
const ROSTER_SELECT = {
  id: true,
  memberId: true,
  status: true,
  waitlistPosition: true,
  createdAt: true,
  member: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.BookingSelect;

type RosterRow = Prisma.BookingGetPayload<{ select: typeof ROSTER_SELECT }>;

/**
 * Staff-console schedule week-view for a gym (read-only, T3.1).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: `ClassInstance` is in
 * the tenant extension's auto-scope set, so every query is auto-constrained to the
 * caller's gym and there is no `gymId` on the wire or in the `where`. Serves the
 * scheduling console's calendar ({@link ClassesController}'s public discovery
 * listing is the anonymous counterpart) — the same materialised occurrences the
 * generation job (T5.3) writes and the booking flow (T5.4) keeps `bookedCount`
 * current on, projected as denormalised blocks the grid renders directly.
 *
 * Unlike the public listing, the staff view returns occurrences of *every* status
 * (a canceled / completed class is shown with its badge, not hidden) so the desk
 * sees the true week, and it honours the calendar's optional trainer / location
 * filters. Placement is by `startsAt` in `[from, to)` — an occurrence spanning
 * midnight into the next week is placed once, by its start — served straight off
 * the `(gymId, startsAt)` index the model was designed around.
 */
@Injectable()
export class AdminScheduleService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly creditPacks: CreditPacksService,
    private readonly tenant: TenantContext,
    private readonly occupancy: ClassOccupancyPublisher,
  ) {}

  /**
   * List the gym's class occurrences in the requested window, ordered by
   * `startsAt` (then `id` for a stable order among occurrences sharing a start).
   * The query is already validated by the controller (well-formed, non-inverted,
   * bounded window), so the service only shapes the tenant-scoped read. An empty
   * array is a normal result the calendar renders as its empty state.
   */
  async listSchedule(query: AdminScheduleQuery): Promise<AdminScheduleResponse> {
    const where: Prisma.ClassInstanceWhereInput = {
      startsAt: { gte: new Date(query.from), lt: new Date(query.to) },
    };

    // The trainer / location live on the template, so a filter narrows through
    // the relation — an occurrence matches when its template's default trainer /
    // branch is the requested one.
    if (query.trainerId || query.locationId) {
      where.template = {
        ...(query.trainerId ? { trainerId: query.trainerId } : {}),
        ...(query.locationId ? { locationId: query.locationId } : {}),
      };
    }

    const rows = await this.prisma.client.classInstance.findMany({
      where,
      select: SCHEDULE_SELECT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });

    return { instances: rows.map((row) => toScheduleInstance(row)) };
  }

  /**
   * One class occurrence in full for the staff schedule drawer (T3.3): the same
   * denormalised block the week grid shows, plus its `waitlistCount` and the
   * `roster` of live bookings (held seats first in booking order, then the
   * waitlist by position). A `404 CLASS_INSTANCE_NOT_FOUND` for an unknown or
   * cross-tenant occurrence.
   */
  async getInstanceDetail(classInstanceId: string): Promise<AdminClassInstanceDetail> {
    const instance = await this.prisma.client.classInstance.findFirst({
      where: { id: classInstanceId },
      select: SCHEDULE_SELECT,
    });
    if (!instance) {
      throw this.instanceNotFound();
    }

    const bookings = await this.prisma.client.booking.findMany({
      where: { classInstanceId, status: { in: [...ROSTER_STATUSES] } },
      select: ROSTER_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return toInstanceDetail(instance, bookings);
  }

  /**
   * Cancel a scheduled class occurrence from the drawer's quick actions (T3.3),
   * in one transaction so the seat accounting stays consistent:
   *
   * - Only a `SCHEDULED` occurrence can be canceled — a completed or
   *   already-canceled one is a `409 CLASS_NOT_CANCELABLE`.
   * - Every live booking is released: each held seat's class credit is refunded
   *   to the exact pack it was drawn from (T8.5) — a no-op for a
   *   subscription-covered or uncharged seat — then all non-canceled bookings
   *   (held seats and the waitlist alike) are flipped to `CANCELED` with their
   *   queue slot cleared.
   * - The occurrence is marked `CANCELED` and its `bookedCount` zeroed, so the
   *   calendar block and the refreshed drawer both show it emptied out.
   *
   * Returns the refreshed {@link AdminClassInstanceDetail} so the drawer and the
   * underlying week grid re-render from the one call.
   */
  async cancelInstance(classInstanceId: string): Promise<AdminClassInstanceDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const instance = await tx.classInstance.findFirst({
        where: { id: classInstanceId },
        select: { id: true, status: true },
      });
      if (!instance) {
        throw this.instanceNotFound();
      }
      if (instance.status !== InstanceStatus.SCHEDULED) {
        throw new ConflictException({
          message: 'Only a scheduled class can be canceled',
          code: 'CLASS_NOT_CANCELABLE',
        });
      }

      // Refund the class credit each *held* seat was paid for back to its pack
      // before the bookings are released. A waitlist entry held no seat, so it
      // carries no credit to refund.
      const heldSeats = await tx.booking.findMany({
        where: { classInstanceId, status: BookingStatus.BOOKED },
        select: { creditPackId: true },
      });
      for (const seat of heldSeats) {
        await this.creditPacks.refundCredit(tx, seat.creditPackId);
      }

      // Release every live booking — held seats and queued entries alike drop to
      // CANCELED with their queue slot cleared, matching the occurrence's own
      // cancellation.
      await tx.booking.updateMany({
        where: { classInstanceId, status: { not: BookingStatus.CANCELED } },
        data: { status: BookingStatus.CANCELED, waitlistPosition: null },
      });

      // The occurrence is canceled and emptied — no seat is held any longer.
      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { status: InstanceStatus.CANCELED, bookedCount: 0 },
      });
    });

    // The occurrence emptied out and flipped to CANCELED — push its settled
    // occupancy to the live schedule + member views (T8.10). Fire-and-forget and
    // best-effort, so it can never fail the cancellation that just committed.
    void this.occupancy.publish(classInstanceId).catch(() => undefined);

    return this.getInstanceDetail(classInstanceId);
  }

  /**
   * Manually promote one waitlisted booking into a held seat from the drawer's
   * waitlist controls (T3.6), in one transaction so the seat accounting stays
   * consistent under concurrency:
   *
   * - Only a `SCHEDULED` occurrence can be altered — a canceled / completed one is
   *   a `409 CLASS_NOT_MODIFIABLE`.
   * - The target must be a live `WAITLIST` booking on this occurrence: an unknown
   *   / cross-tenant one is a `404 BOOKING_NOT_FOUND`, and a held-seat / canceled
   *   one a `409 BOOKING_NOT_PROMOTABLE`. The flip is a conditional claim guarded
   *   on `status = WAITLIST`, so an entry a concurrent member cancellation already
   *   auto-promoted (T5.5) yields count 0 and is reported `BOOKING_NOT_PROMOTABLE`
   *   rather than promoted — and counted — twice.
   * - Unlike that member-cancel auto-promotion (a *transfer* into a just-freed
   *   seat, which leaves `bookedCount` put), a manual promote *adds* a held seat,
   *   so `bookedCount` is incremented. This is a deliberate desk override and may
   *   take the occurrence over its listed capacity — the staff decided this member
   *   gets in. The promoted member pays a class credit best-effort (never blocked
   *   when out of credits, mirroring the auto-promotion), and the gap they leave in
   *   the queue is closed so the remaining waitlist stays a contiguous `1..N`.
   *
   * Returns the refreshed {@link AdminClassInstanceDetail} so the drawer and the
   * underlying week grid re-render from the one call.
   */
  async promoteWaitlistEntry(
    classInstanceId: string,
    bookingId: string,
  ): Promise<AdminClassInstanceDetail> {
    await this.prisma.client.$transaction(async (tx) => {
      const instance = await tx.classInstance.findFirst({
        where: { id: classInstanceId },
        select: { id: true, status: true },
      });
      if (!instance) {
        throw this.instanceNotFound();
      }
      if (instance.status !== InstanceStatus.SCHEDULED) {
        throw new ConflictException({
          message: 'Only a scheduled class can be modified',
          code: 'CLASS_NOT_MODIFIABLE',
        });
      }

      const booking = await tx.booking.findFirst({
        where: { id: bookingId, classInstanceId },
        select: { id: true, status: true, waitlistPosition: true, memberId: true },
      });
      if (!booking) {
        throw this.bookingNotFound();
      }
      if (booking.status !== BookingStatus.WAITLIST) {
        throw this.bookingNotPromotable();
      }

      // Conditional claim guarded on `status = WAITLIST`: a concurrent member
      // cancellation that already auto-promoted this entry (T5.5) yields count 0,
      // so the manual promote is rejected rather than double-counting the seat.
      const claimed = await tx.booking.updateMany({
        where: { id: booking.id, status: BookingStatus.WAITLIST },
        data: { status: BookingStatus.BOOKED, waitlistPosition: null },
      });
      if (claimed.count !== 1) {
        throw this.bookingNotPromotable();
      }

      // The promoted member now holds a seat, so they pay a class credit too
      // (T8.5) — best-effort (`required: false`): a member out of credits is never
      // blocked from a seat the desk chose to grant them. The pack charged (if
      // any) is recorded for their own later cancellation refund.
      const promotedPackId = await this.creditPacks.chargeSeatCredit(tx, booking.memberId, {
        required: false,
      });
      if (promotedPackId) {
        await tx.booking.update({
          where: { id: booking.id },
          data: { creditPackId: promotedPackId },
        });
      }

      // A manual promote *adds* a held seat (a desk override), so the occupancy
      // counter grows by one — distinct from the cancel auto-promotion, which
      // transfers a just-freed seat and leaves `bookedCount` put.
      await tx.classInstance.update({
        where: { id: classInstanceId },
        data: { bookedCount: { increment: 1 } },
      });

      // Close the gap the promoted member leaves so the remaining waitlist keeps
      // contiguous 1..N positions (a live WAITLIST entry always carries a slot).
      if (booking.waitlistPosition !== null) {
        await tx.booking.updateMany({
          where: {
            classInstanceId,
            status: BookingStatus.WAITLIST,
            waitlistPosition: { gt: booking.waitlistPosition },
          },
          data: { waitlistPosition: { decrement: 1 } },
        });
      }
    });

    // A desk promote added a held seat and shortened the queue — push the
    // occurrence's settled occupancy to the live schedule + member views (T8.10).
    // Fire-and-forget and best-effort, so it can never fail the promote that just
    // committed.
    void this.occupancy.publish(classInstanceId).catch(() => undefined);

    return this.getInstanceDetail(classInstanceId);
  }

  /**
   * Book a member onto a scheduled class occurrence on their behalf from the
   * drawer (T3.7) — the front-desk flow. Mirrors the member self-book's
   * capacity/credit rules ({@link BookingsService.book}), but the member is
   * chosen by the desk (validated to belong to this gym) rather than resolved
   * from the caller's own session:
   *
   * - The member must be a member of this gym — an unknown / cross-tenant id is a
   *   `404 MEMBER_NOT_FOUND` — and their membership must not be frozen (`409
   *   SUBSCRIPTION_FROZEN`), the same access gate a self-book honours.
   * - Only a `SCHEDULED` occurrence takes a booking (`409 CLASS_NOT_BOOKABLE`); a
   *   member who already holds a live booking for it is a `409 ALREADY_BOOKED`
   *   (re-checked on the partial unique in case a duplicate races the pre-check).
   * - A seat is claimed with the same atomic capacity gate — the increment runs
   *   only while there is room, evaluated against the live row, so the last seat
   *   is taken by exactly one of N concurrent writers; when the occurrence is full
   *   the member is queued onto the tail of the waitlist instead. A confirmed seat
   *   draws a class credit (required, so a `422 INSUFFICIENT_CREDITS` rolls the
   *   booking back) unless an entitling subscription already covers them; a
   *   waitlist entry holds no seat and draws nothing.
   *
   * Returns the refreshed {@link AdminClassInstanceDetail} so the drawer and the
   * underlying week grid re-render from the one call, exactly like cancel and
   * promote.
   */
  async bookMemberOntoClass(
    classInstanceId: string,
    memberId: string,
  ): Promise<AdminClassInstanceDetail> {
    await this.requireGymMember(memberId);
    await this.assertSubscriptionNotFrozen(memberId);

    try {
      await this.prisma.client.$transaction(async (tx) => {
        const instance = await tx.classInstance.findFirst({
          where: { id: classInstanceId },
          select: {
            id: true,
            status: true,
            bookedCount: true,
            capacityOverride: true,
            template: { select: { capacity: true } },
          },
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

        // Same atomic seat claim as the member self-book: the increment runs only
        // while there is room and the DB evaluates `bookedCount < capacity`
        // against the live row, so the last seat is taken by exactly one of N
        // concurrent writers — the loser is queued onto the waitlist.
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

        // A confirmed seat draws a class credit (required) unless an entitling
        // subscription already covers the member — the same rule the self-book
        // honours, drawn inside the transaction so an `INSUFFICIENT_CREDITS`
        // refusal rolls back the seat claim too. A waitlist entry holds no seat,
        // so it draws nothing. The pack charged (or `null`) is recorded for a
        // later in-policy cancellation refund.
        const creditPackId = booked ? await this.creditPacks.chargeSeatCredit(tx, memberId) : null;

        await tx.booking.create({
          data: {
            gymId: this.tenant.gymId,
            classInstanceId,
            memberId,
            status: booked ? BookingStatus.BOOKED : BookingStatus.WAITLIST,
            waitlistPosition,
            creditPackId,
            // A desk booking carries no client idempotency key; a fresh one keeps
            // the required unique column satisfied.
            idempotencyKey: randomUUID(),
          },
          select: { id: true },
        });
      });
    } catch (error) {
      // A concurrent duplicate slipped past the pre-check — the partial unique on
      // (classInstanceId, memberId) WHERE status != CANCELED fired: the member
      // already holds a live booking (the seat this attempt claimed was rolled
      // back with the failed insert).
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw this.alreadyBooked();
      }
      throw error;
    }

    // A front-desk booking claimed a seat (or queued the member) — push the
    // occurrence's settled occupancy to the live schedule + member views (T8.10).
    // Fire-and-forget and best-effort, so it can never fail the booking that just
    // committed.
    void this.occupancy.publish(classInstanceId).catch(() => undefined);

    return this.getInstanceDetail(classInstanceId);
  }

  /**
   * Resolve the gym member the desk is booking — the booking's `memberId`. Runs
   * on the tenant-scoped client, so it only ever finds a member of the caller's
   * own gym; an unknown or cross-tenant id is a `404 MEMBER_NOT_FOUND`.
   */
  private async requireGymMember(memberId: string): Promise<void> {
    const member = await this.prisma.client.gymMember.findFirst({
      where: { id: memberId },
      select: { id: true },
    });
    if (!member) {
      throw new NotFoundException({
        message: 'Member not found',
        code: 'MEMBER_NOT_FOUND',
      });
    }
  }

  /**
   * Block booking a member whose membership is frozen (mirrors the self-book gate
   * in {@link BookingsService}): a `FROZEN` subscription is a deliberately paused
   * membership granting no access, so booking the member into a class is a `409
   * SUBSCRIPTION_FROZEN`. A member with no frozen subscription (the common case)
   * is unaffected — the check only fires on an explicit freeze. Tenant-scoped, so
   * it only ever sees the caller's own gym.
   */
  private async assertSubscriptionNotFrozen(memberId: string): Promise<void> {
    const frozen = await this.prisma.client.subscription.findFirst({
      where: { memberId, status: SubscriptionStatus.FROZEN },
      select: { id: true },
    });
    if (frozen) {
      throw new ConflictException({
        message: 'This membership is frozen; resume it to book classes',
        code: 'SUBSCRIPTION_FROZEN',
      });
    }
  }

  /** `409` when the member already holds a live (non-canceled) booking for the occurrence. */
  private alreadyBooked(): ConflictException {
    return new ConflictException({
      message: 'This member already has a booking for this class',
      code: 'ALREADY_BOOKED',
    });
  }

  /** `404` for an unknown / cross-tenant occurrence id. */
  private instanceNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'Class occurrence not found',
      code: 'CLASS_INSTANCE_NOT_FOUND',
    });
  }

  /** `404` for a booking that isn't on this occurrence (unknown / cross-tenant). */
  private bookingNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'Booking not found',
      code: 'BOOKING_NOT_FOUND',
    });
  }

  /** `409` for a booking that can't be promoted (not a live waitlist entry). */
  private bookingNotPromotable(): ConflictException {
    return new ConflictException({
      message: 'Only a waitlisted booking can be promoted',
      code: 'BOOKING_NOT_PROMOTABLE',
    });
  }
}

/** The held-seat statuses, ordered before the waitlist in the drawer roster. */
const HELD_SEAT_STATUSES: readonly AdminRosterBookingStatus[] = [
  BookingStatus.BOOKED,
  BookingStatus.ATTENDED,
  BookingStatus.NO_SHOW,
];

/**
 * Project an occurrence + its live bookings to the {@link AdminClassInstanceDetail}
 * the drawer renders. The roster is ordered held-seats-first (in booking order),
 * then the waitlist by ascending position, so the desk reads the confirmed
 * attendees above the queue.
 */
function toInstanceDetail(row: ScheduleRow, bookings: RosterRow[]): AdminClassInstanceDetail {
  const roster: AdminClassInstanceRosterEntry[] = bookings
    .map((booking) => ({
      bookingId: booking.id,
      memberId: booking.memberId,
      memberName: booking.member.user.name,
      memberEmail: booking.member.user.email,
      status: booking.status as AdminRosterBookingStatus,
      waitlistPosition: booking.waitlistPosition,
      bookedAt: booking.createdAt.toISOString(),
    }))
    .sort(compareRosterEntries);

  return {
    ...toScheduleInstance(row),
    waitlistCount: roster.filter((entry) => entry.status === BookingStatus.WAITLIST).length,
    roster,
  };
}

/**
 * Order roster entries held-seats-first (by booking time), then waitlist entries
 * by their queue position — so the confirmed attendees read above the queue and
 * each group keeps a stable, meaningful order.
 */
function compareRosterEntries(
  a: AdminClassInstanceRosterEntry,
  b: AdminClassInstanceRosterEntry,
): number {
  const aHeld = HELD_SEAT_STATUSES.includes(a.status);
  const bHeld = HELD_SEAT_STATUSES.includes(b.status);
  if (aHeld !== bHeld) {
    return aHeld ? -1 : 1;
  }
  if (aHeld) {
    return a.bookedAt.localeCompare(b.bookedAt);
  }
  return (a.waitlistPosition ?? 0) - (b.waitlistPosition ?? 0);
}

/**
 * Project a joined occurrence row to the denormalised {@link AdminScheduleInstance}
 * the calendar renders — resolving the per-occurrence capacity override, keeping
 * the template's scheduled `durationMinutes` as the block height, and flattening an
 * absent trainer / location / room to `null` (the admin convention, distinct from
 * the public card's empty strings).
 */
function toScheduleInstance(row: ScheduleRow): AdminScheduleInstance {
  return {
    id: row.id,
    templateId: row.templateId,
    title: row.template.title,
    category: row.template.category,
    color: row.template.color,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: row.template.durationMinutes,
    trainerName: row.template.trainer?.name ?? null,
    locationName: row.template.location?.name ?? null,
    room: row.template.room ?? null,
    capacity: row.capacityOverride ?? row.template.capacity,
    bookedCount: row.bookedCount,
    status: row.status,
  };
}
