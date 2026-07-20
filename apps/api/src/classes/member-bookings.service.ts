import { ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type {
  ListMemberBookingsQuery,
  ListMemberBookingsResult,
  MemberBookingHistoryEntry,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The booking + occurrence columns the member-history projection reads. The
 * template carries the denormalised display fields (title/description/category/
 * colour) and the seat/duration figures, mirroring the public detail projection
 * in {@link ClassesService} so a history card and a class detail page agree. */
const HISTORY_SELECT = {
  id: true,
  status: true,
  waitlistPosition: true,
  createdAt: true,
  classInstance: {
    select: {
      id: true,
      startsAt: true,
      endsAt: true,
      capacityOverride: true,
      bookedCount: true,
      status: true,
      room: true,
      trainer: { select: { name: true } },
      location: { select: { name: true } },
      template: {
        select: {
          title: true,
          description: true,
          category: true,
          color: true,
          room: true,
          capacity: true,
          durationMinutes: true,
          trainer: { select: { name: true } },
          location: { select: { name: true } },
        },
      },
      classType: {
        select: {
          name: true,
          description: true,
          color: true,
          capacity: true,
          durationMinutes: true,
        },
      },
    },
  },
} satisfies Prisma.BookingSelect;

type HistoryRow = Prisma.BookingGetPayload<{ select: typeof HISTORY_SELECT }>;

/**
 * Member-facing booking history (`GET /me/bookings`, T5.10).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `booking` /
 * `gymMember` query is auto-constrained to the caller's gym by the Prisma tenant
 * extension, so a member only ever sees their own gym's bookings — there is no
 * `gymId` to pass or to forget. The member reads *their own* history: the
 * caller's gym membership (resolved from the session's user id) is the
 * `memberId` filter, never a value off the wire.
 *
 * Unlike the staff attendance roster (one occurrence, held seats only) this is
 * one member across many occurrences and *every* booking status — a confirmed
 * seat, a waitlist place, a past `ATTENDED` / `NO_SHOW`, and a `CANCELED`
 * booking all belong in the history. The {@link MemberBookingScope scope} filter
 * narrows it to `upcoming` / `past` when a caller only needs one slice.
 */
@Injectable()
export class MemberBookingsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * List the calling member's bookings for the requested scope. Resolves the
   * caller's own gym membership (a non-member is a `403`), then reads their
   * bookings joined to each occurrence + template, ordered by the occurrence's
   * start: ascending for `upcoming` (soonest first) and descending for `past` /
   * `all` (most recent first). An empty result is a normal success — a member
   * who has never booked.
   */
  async list(query: ListMemberBookingsQuery): Promise<ListMemberBookingsResult> {
    const memberId = await this.requireCallerMembership();

    // `upcoming` / `past` split on the occurrence's start relative to now; `all`
    // applies no time filter. The boundary is computed once so a long page of
    // rows can't straddle two different "now"s.
    const now = new Date();
    const startsAtFilter =
      query.scope === 'upcoming' ? { gte: now } : query.scope === 'past' ? { lt: now } : undefined;

    const rows = await this.prisma.client.booking.findMany({
      where: {
        memberId,
        ...(startsAtFilter ? { classInstance: { startsAt: startsAtFilter } } : {}),
      },
      select: HISTORY_SELECT,
      orderBy: { classInstance: { startsAt: query.scope === 'upcoming' ? 'asc' : 'desc' } },
    });

    return { bookings: rows.map(toHistoryEntry) };
  }

  /**
   * Resolve the calling user's membership in the current gym — the `memberId`
   * the history is filtered by. `@RequirePermissions(ClassBook)` guarantees an
   * authenticated caller; that user must also be a member of this gym, so a
   * non-member (e.g. a stray cross-tenant identity) is a `403`. Mirrors
   * {@link BookingsService.requireCallerMembership}.
   */
  private async requireCallerMembership(): Promise<string> {
    const userId = this.tenant.userId;
    if (!userId) {
      throw new ForbiddenException({
        message: 'A member session is required to view bookings',
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
}

/** Project a joined booking row to a history entry — flattening the optional
 * trainer / location / room to empty strings (as the wire contract defines) and
 * resolving the per-occurrence capacity override, exactly as the public detail
 * projection does. */
function toHistoryEntry(row: HistoryRow): MemberBookingHistoryEntry {
  const { classInstance: instance } = row;
  return {
    bookingId: row.id,
    status: row.status,
    waitlistPosition: row.waitlistPosition,
    bookedAt: row.createdAt.toISOString(),
    classInstance: {
      id: instance.id,
      title: instance.template?.title ?? instance.classType?.name ?? 'Class',
      description: instance.template?.description ?? instance.classType?.description ?? '',
      startsAt: instance.startsAt.toISOString(),
      endsAt: instance.endsAt.toISOString(),
      trainerName: instance.trainer?.name ?? instance.template?.trainer?.name ?? '',
      locationName: instance.location?.name ?? instance.template?.location?.name ?? '',
      room: instance.room ?? instance.template?.room ?? '',
      capacity:
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0,
      bookedCount: instance.bookedCount,
      durationMinutes:
        instance.template?.durationMinutes ??
        instance.classType?.durationMinutes ??
        Math.max(1, Math.round((instance.endsAt.getTime() - instance.startsAt.getTime()) / 60000)),
      category: instance.template?.category ?? '',
      color: instance.template?.color ?? instance.classType?.color ?? '#2563eb',
      status: instance.status,
    },
  };
}
