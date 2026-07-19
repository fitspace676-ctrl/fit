import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, InstanceStatus, Prisma } from '@fit/db';
import type { AttendanceRoster, AttendanceRosterEntry, MarkAttendanceData } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** The held-seat booking statuses that make up an attendance roster. A
 * `WAITLIST` / `CANCELED` booking never held a seat, so it is excluded — only
 * these three can appear on the roster or be (re-)marked. */
const ROSTER_STATUSES = [
  BookingStatus.BOOKED,
  BookingStatus.ATTENDED,
  BookingStatus.NO_SHOW,
] as const;

/** The occurrence fields the roster projection and the attendance gates need. */
const INSTANCE_SELECT = {
  id: true,
  status: true,
  startsAt: true,
  endsAt: true,
  bookedCount: true,
  capacityOverride: true,
  template: { select: { capacity: true } },
  classType: { select: { capacity: true } },
} satisfies Prisma.ClassInstanceSelect;

/** A held-seat booking joined to the (cross-tenant) member identity. Kept narrow
 * — only the `name` / `email` needed to identify the person on the roster, never
 * the PII the member table doesn't need. */
const ROSTER_BOOKING_SELECT = {
  id: true,
  memberId: true,
  status: true,
  createdAt: true,
  member: { select: { user: { select: { name: true, email: true } } } },
} satisfies Prisma.BookingSelect;

type RosterBookingRecord = Prisma.BookingGetPayload<{ select: typeof ROSTER_BOOKING_SELECT }>;

/**
 * Staff-console attendance tracking for a class occurrence (T5.7).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `classInstance`
 * / `booking` query is auto-constrained to the caller's gym by the Prisma tenant
 * extension, so staff can only ever read or mark attendance for their own gym's
 * occurrences — there is no `gymId` to pass or to forget.
 *
 * Attendance is a transition on a booking that *held a seat*: `BOOKED →
 * ATTENDED | NO_SHOW`. The two correctness properties the flow holds:
 *
 * - **Only held seats are markable.** A `WAITLIST` entry never got a seat and a
 *   `CANCELED` booking released theirs, so neither appears on the roster nor can
 *   be marked — an attempt to mark one is a `409 BOOKING_NOT_ATTENDABLE`. Already
 *   `ATTENDED` / `NO_SHOW` rows *can* be re-marked, so a mistyped roster is
 *   correctable.
 * - **Attendance is recorded once the class has run.** Marking before the
 *   occurrence has started is meaningless, so it is gated on `startsAt <= now`
 *   (`409 CLASS_NOT_STARTED`); a `CANCELED` occurrence can never be attended
 *   (`409 ATTENDANCE_NOT_AVAILABLE`). Recording attendance transitions the
 *   occurrence to `COMPLETED`.
 */
@Injectable()
export class AttendanceService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /**
   * The occurrence's attendance roster — its held-seat bookings (in booking
   * order) plus the member behind each, with the live seat totals and the
   * attended / no-show tallies. A `404 CLASS_INSTANCE_NOT_FOUND` for an unknown
   * or cross-tenant occurrence.
   */
  async getRoster(classInstanceId: string): Promise<AttendanceRoster> {
    const instance = await this.prisma.client.classInstance.findFirst({
      where: { id: classInstanceId },
      select: INSTANCE_SELECT,
    });
    if (!instance) {
      throw this.instanceNotFound();
    }

    const bookings = await this.prisma.client.booking.findMany({
      where: { classInstanceId, status: { in: [...ROSTER_STATUSES] } },
      select: ROSTER_BOOKING_SELECT,
      orderBy: { createdAt: 'asc' },
    });

    return this.toRoster(classInstanceId, instance, bookings);
  }

  /**
   * Record attendance for one or more held seats on an occurrence (T5.7), in a
   * single transaction so the roster stays consistent and the occurrence is only
   * completed once every mark has landed.
   *
   * Validates the occurrence is attendable (started, not canceled) and that each
   * referenced booking is a live held seat for *this* occurrence, then flips each
   * to its `ATTENDED` / `NO_SHOW` outcome and transitions the occurrence to
   * `COMPLETED`. Returns the refreshed roster.
   *
   * Failure modes: `404 CLASS_INSTANCE_NOT_FOUND` (unknown / cross-tenant
   * occurrence), `409 ATTENDANCE_NOT_AVAILABLE` (canceled occurrence), `409
   * CLASS_NOT_STARTED` (occurrence is still in the future), `404 BOOKING_NOT_FOUND`
   * (a referenced booking is unknown / not on this occurrence), and `409
   * BOOKING_NOT_ATTENDABLE` (the booking holds no seat — waitlisted or canceled).
   */
  async markAttendance(
    classInstanceId: string,
    data: MarkAttendanceData,
  ): Promise<AttendanceRoster> {
    return this.prisma.client.$transaction(async (tx) => {
      const instance = await tx.classInstance.findFirst({
        where: { id: classInstanceId },
        select: INSTANCE_SELECT,
      });
      if (!instance) {
        throw this.instanceNotFound();
      }
      if (instance.status === InstanceStatus.CANCELED) {
        throw new ConflictException({
          message: 'Attendance cannot be tracked for a canceled class',
          code: 'ATTENDANCE_NOT_AVAILABLE',
        });
      }
      if (instance.startsAt.getTime() > Date.now()) {
        throw new ConflictException({
          message: 'Attendance can only be recorded once the class has started',
          code: 'CLASS_NOT_STARTED',
        });
      }

      // Resolve every referenced booking up front so a single bad id rejects the
      // whole batch before any write — attendance is recorded all-or-nothing.
      for (const entry of data.entries) {
        const booking = await tx.booking.findFirst({
          where: { id: entry.bookingId, classInstanceId },
          select: { id: true, status: true },
        });
        if (!booking) {
          throw new NotFoundException({
            message: `Booking "${entry.bookingId}" was not found on this class`,
            code: 'BOOKING_NOT_FOUND',
          });
        }
        if (!ROSTER_STATUSES.includes(booking.status as (typeof ROSTER_STATUSES)[number])) {
          // Waitlisted / canceled bookings never held a seat — there is nothing
          // to attend.
          throw new ConflictException({
            message: `Booking "${entry.bookingId}" did not hold a seat and cannot be marked`,
            code: 'BOOKING_NOT_ATTENDABLE',
          });
        }
      }

      for (const entry of data.entries) {
        await tx.booking.update({
          where: { id: entry.bookingId },
          data: { status: entry.status },
        });
      }

      // Recording attendance completes the past occurrence. Idempotent — a
      // re-mark for corrections leaves it COMPLETED.
      if (instance.status !== InstanceStatus.COMPLETED) {
        await tx.classInstance.update({
          where: { id: classInstanceId },
          data: { status: InstanceStatus.COMPLETED },
        });
      }

      const bookings = await tx.booking.findMany({
        where: { classInstanceId, status: { in: [...ROSTER_STATUSES] } },
        select: ROSTER_BOOKING_SELECT,
        orderBy: { createdAt: 'asc' },
      });

      return this.toRoster(
        classInstanceId,
        { ...instance, status: InstanceStatus.COMPLETED },
        bookings,
      );
    });
  }

  /** Project an occurrence + its held-seat bookings to the wire roster shape. */
  private toRoster(
    classInstanceId: string,
    instance: Prisma.ClassInstanceGetPayload<{ select: typeof INSTANCE_SELECT }>,
    bookings: RosterBookingRecord[],
  ): AttendanceRoster {
    const entries: AttendanceRosterEntry[] = bookings.map((booking) => ({
      bookingId: booking.id,
      memberId: booking.memberId,
      memberName: booking.member.user.name,
      memberEmail: booking.member.user.email,
      status: booking.status as AttendanceRosterEntry['status'],
      bookedAt: booking.createdAt.toISOString(),
    }));

    return {
      classInstanceId,
      status: instance.status,
      startsAt: instance.startsAt.toISOString(),
      endsAt: instance.endsAt.toISOString(),
      capacity:
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0,
      bookedCount: instance.bookedCount,
      attendedCount: entries.filter((e) => e.status === BookingStatus.ATTENDED).length,
      noShowCount: entries.filter((e) => e.status === BookingStatus.NO_SHOW).length,
      entries,
    };
  }

  /** `404` for an unknown / cross-tenant occurrence id. */
  private instanceNotFound(): NotFoundException {
    return new NotFoundException({
      message: 'Class occurrence not found',
      code: 'CLASS_INSTANCE_NOT_FOUND',
    });
  }
}
