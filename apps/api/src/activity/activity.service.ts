import { Injectable } from '@nestjs/common';
import { PaymentStatus, Prisma, Role } from '@fit/db';
import {
  ACTIVITY_EVENT_TYPES,
  type ActivityEvent,
  type ActivityEventType,
  type ListActivityQuery,
  type ListActivityResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The member-identity columns every source joins to for a display name. */
const MEMBER_IDENTITY_SELECT = {
  user: { select: { name: true, email: true } },
} satisfies Prisma.GymMemberSelect;

/** An `{ at, apply }` window filter compiled once from the query's `from`/`to`. */
interface DateWindow {
  gte?: Date;
  lt?: Date;
}

/**
 * Read side of the staff console's Activity screen (T3.8) — the unified event
 * stream that powers `activity.tsx`.
 *
 * The feed is **derived, never written**: there is no `activity` table. Each of
 * the five event kinds projects a row that already exists in its own table
 * ({@link Role MEMBER} `GymMember`, `Booking`, `CheckIn`, captured `Payment`,
 * `Subscription`), so no new write path is introduced — the stream is a read-time
 * merge of records other features already create.
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: `GymMember`,
 * `Booking`, `Payment` and `Subscription` are all in the tenant extension's
 * auto-scope set, so those queries are constrained to the caller's gym with no
 * `gymId` on the wire. `CheckIn` is deliberately *not* auto-scoped (like the
 * reception service), so its queries pin the tenant explicitly from
 * {@link TenantContext.gymId}. Either way a staff member only ever reads their own
 * gym's activity.
 *
 * Pagination across heterogeneous sources is a bounded merge: the global newest
 * `skip + limit` events are always a subset of the newest `skip + limit` of each
 * source, so each source is queried for at most that many rows, the results are
 * merged, sorted newest-first, and the requested page sliced out. `total` is the
 * exact sum of the per-source filtered counts, so the pager stays accurate without
 * materialising the whole stream.
 */
@Injectable()
export class ActivityService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One filtered, server-paginated page of the gym's unified activity stream,
   * newest first. The query is validated up front (a bad page/limit/date is a
   * `400` from the controller), so this only ever sees a well-formed request. An
   * empty page is a normal result.
   */
  async listActivity(query: ListActivityQuery): Promise<ListActivityResponse> {
    const window = this.resolveWindow(query);
    const kinds = query.type ? [query.type] : [...ACTIVITY_EVENT_TYPES];
    // The most rows any single source can contribute to the requested page.
    const ceiling = query.page * query.limit;

    const [events, total] = await Promise.all([
      this.collectEvents(kinds, window, ceiling),
      this.countEvents(kinds, window),
    ]);

    const skip = (query.page - 1) * query.limit;
    const data = events
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(skip, skip + query.limit);

    return { data, total, page: query.page, limit: query.limit };
  }

  /**
   * Compile the optional `from` / `to` calendar days into an instant window. `to`
   * is made inclusive of the whole day by taking events strictly before the start
   * of the day *after* it — identical to the audit-log viewer's range handling.
   */
  private resolveWindow(query: ListActivityQuery): DateWindow {
    const window: DateWindow = {};
    if (query.from) {
      window.gte = new Date(`${query.from}T00:00:00.000Z`);
    }
    if (query.to) {
      const next = new Date(`${query.to}T00:00:00.000Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      window.lt = next;
    }
    return window;
  }

  /** A `DateTimeFilter` for a source's timestamp column, or `undefined` when unbounded. */
  private timeFilter(window: DateWindow): Prisma.DateTimeFilter | undefined {
    if (!window.gte && !window.lt) {
      return undefined;
    }
    const filter: Prisma.DateTimeFilter = {};
    if (window.gte) {
      filter.gte = window.gte;
    }
    if (window.lt) {
      filter.lt = window.lt;
    }
    return filter;
  }

  /**
   * Fetch, from each requested source, its newest `ceiling` events inside the
   * window and flatten them into one unsorted list. Sources run concurrently; the
   * caller sorts + slices the merged result.
   */
  private async collectEvents(
    kinds: ActivityEventType[],
    window: DateWindow,
    ceiling: number,
  ): Promise<ActivityEvent[]> {
    const batches = await Promise.all(kinds.map((kind) => this.collectKind(kind, window, ceiling)));
    return batches.flat();
  }

  /** Fetch the newest `ceiling` events of one kind inside the window. */
  private collectKind(
    kind: ActivityEventType,
    window: DateWindow,
    ceiling: number,
  ): Promise<ActivityEvent[]> {
    switch (kind) {
      case 'signup':
        return this.collectSignups(window, ceiling);
      case 'booking':
        return this.collectBookings(window, ceiling);
      case 'checkin':
        return this.collectCheckins(window, ceiling);
      case 'sale':
        return this.collectSales(window, ceiling);
      case 'subscription':
        return this.collectSubscriptions(window, ceiling);
    }
  }

  /** New members who joined — auto-scoped `GymMember` (role MEMBER only). */
  private async collectSignups(window: DateWindow, take: number): Promise<ActivityEvent[]> {
    const joinedAt = this.timeFilter(window);
    const rows = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, ...(joinedAt ? { joinedAt } : {}) },
      orderBy: { joinedAt: 'desc' },
      take,
      select: { id: true, joinedAt: true, ...MEMBER_IDENTITY_SELECT },
    });
    return rows.map((row) => ({
      id: `signup:${row.id}`,
      type: 'signup',
      title: 'New member',
      detail: row.user.email,
      memberId: row.id,
      memberName: row.user.name ?? row.user.email,
      amount: null,
      currency: null,
      at: row.joinedAt.toISOString(),
    }));
  }

  /** Class reservations — auto-scoped `Booking`, joined to its class + member. */
  private async collectBookings(window: DateWindow, take: number): Promise<ActivityEvent[]> {
    const createdAt = this.timeFilter(window);
    const rows = await this.prisma.client.booking.findMany({
      where: createdAt ? { createdAt } : {},
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        status: true,
        createdAt: true,
        member: { select: { id: true, ...MEMBER_IDENTITY_SELECT } },
        classInstance: {
          select: {
            template: { select: { title: true } },
            classType: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((row) => ({
      id: `booking:${row.id}`,
      type: 'booking',
      title: `Booked ${row.classInstance.template?.title ?? row.classInstance.classType?.name ?? 'a class'}`,
      detail: row.status,
      memberId: row.member.id,
      memberName: row.member.user.name ?? row.member.user.email,
      amount: null,
      currency: null,
      at: row.createdAt.toISOString(),
    }));
  }

  /**
   * Reception arrivals — `CheckIn` is not in the auto-scope set, so the query pins
   * the tenant explicitly from the context, exactly like the reception service.
   */
  private async collectCheckins(window: DateWindow, take: number): Promise<ActivityEvent[]> {
    const checkedInAt = this.timeFilter(window);
    const rows = await this.prisma.client.checkIn.findMany({
      where: { gymId: this.tenant.gymId, ...(checkedInAt ? { checkedInAt } : {}) },
      orderBy: { checkedInAt: 'desc' },
      take,
      select: {
        id: true,
        method: true,
        checkedInAt: true,
        member: { select: { id: true, ...MEMBER_IDENTITY_SELECT } },
      },
    });
    return rows.map((row) => ({
      id: `checkin:${row.id}`,
      type: 'checkin',
      title: 'Checked in',
      detail: row.method === 'QR' ? 'QR scan' : 'Front desk',
      memberId: row.member.id,
      memberName: row.member.user.name ?? row.member.user.email,
      amount: null,
      currency: null,
      at: row.checkedInAt.toISOString(),
    }));
  }

  /**
   * Captured sales — auto-scoped `Payment` (status `CAPTURED` = settled money),
   * joined to its order's member. A guest checkout has no member: fall back to the
   * order's captured customer name, or leave the member fields `null`.
   */
  private async collectSales(window: DateWindow, take: number): Promise<ActivityEvent[]> {
    const createdAt = this.timeFilter(window);
    const rows = await this.prisma.client.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, ...(createdAt ? { createdAt } : {}) },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        amount: true,
        currency: true,
        method: true,
        createdAt: true,
        order: {
          select: {
            customerName: true,
            member: { select: { id: true, ...MEMBER_IDENTITY_SELECT } },
          },
        },
      },
    });
    return rows.map((row) => {
      const member = row.order?.member ?? null;
      const memberName = member
        ? (member.user.name ?? member.user.email)
        : (row.order?.customerName ?? null);
      return {
        id: `sale:${row.id}`,
        type: 'sale',
        title: 'Sale captured',
        detail: this.settlementLabel(row.method),
        memberId: member?.id ?? null,
        memberName,
        amount: row.amount,
        currency: row.currency,
        at: row.createdAt.toISOString(),
      };
    });
  }

  /** Subscription enrolments — auto-scoped `Subscription`, joined to plan + member. */
  private async collectSubscriptions(window: DateWindow, take: number): Promise<ActivityEvent[]> {
    const createdAt = this.timeFilter(window);
    const rows = await this.prisma.client.subscription.findMany({
      where: createdAt ? { createdAt } : {},
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true,
        status: true,
        createdAt: true,
        member: { select: { id: true, ...MEMBER_IDENTITY_SELECT } },
        plan: { select: { name: true } },
      },
    });
    return rows.map((row) => ({
      id: `subscription:${row.id}`,
      type: 'subscription',
      title: `Subscribed to ${row.plan?.name ?? 'a plan'}`,
      detail: row.status,
      memberId: row.member.id,
      memberName: row.member.user.name ?? row.member.user.email,
      amount: null,
      currency: null,
      at: row.createdAt.toISOString(),
    }));
  }

  /** The exact count of every requested source inside the window, summed. */
  private async countEvents(kinds: ActivityEventType[], window: DateWindow): Promise<number> {
    const counts = await Promise.all(kinds.map((kind) => this.countKind(kind, window)));
    return counts.reduce((sum, n) => sum + n, 0);
  }

  /** The filtered count of one source inside the window. */
  private countKind(kind: ActivityEventType, window: DateWindow): Promise<number> {
    switch (kind) {
      case 'signup': {
        const joinedAt = this.timeFilter(window);
        return this.prisma.client.gymMember.count({
          where: { role: Role.MEMBER, ...(joinedAt ? { joinedAt } : {}) },
        });
      }
      case 'booking': {
        const createdAt = this.timeFilter(window);
        return this.prisma.client.booking.count({ where: createdAt ? { createdAt } : {} });
      }
      case 'checkin': {
        const checkedInAt = this.timeFilter(window);
        return this.prisma.client.checkIn.count({
          where: { gymId: this.tenant.gymId, ...(checkedInAt ? { checkedInAt } : {}) },
        });
      }
      case 'sale': {
        const createdAt = this.timeFilter(window);
        return this.prisma.client.payment.count({
          where: { status: PaymentStatus.CAPTURED, ...(createdAt ? { createdAt } : {}) },
        });
      }
      case 'subscription': {
        const createdAt = this.timeFilter(window);
        return this.prisma.client.subscription.count({ where: createdAt ? { createdAt } : {} });
      }
    }
  }

  /** Human label for a sale's settlement channel, mirroring the reconciliation view. */
  private settlementLabel(method: 'CASH' | 'CARD' | 'MEMBER_ACCOUNT'): string {
    switch (method) {
      case 'CASH':
        return 'Cash';
      case 'CARD':
        return 'Card';
      case 'MEMBER_ACCOUNT':
        return 'Member account';
    }
  }
}
