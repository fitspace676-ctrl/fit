import { Injectable } from '@nestjs/common';
import { BookingStatus, PaymentStatus, Role, SubscriptionStatus } from '@fit/db';
import {
  DEFAULT_ANALYTICS_RANGE,
  deriveOrderChannel,
  type AdminAnalyticsResponse,
  type AnalyticsChannelSlice,
  type AnalyticsKpi,
  type AnalyticsPlanSlice,
  type AnalyticsPoint,
  type AnalyticsRange,
  type AnalyticsTopClass,
  type OrderChannel,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

/** Milliseconds in a day, for window math. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** How a range resolves into a concrete window + bucket granularity. */
interface WindowSpec {
  /** Inclusive start of the current window. */
  start: Date;
  /** Exclusive end of the current window (always "now"). */
  end: Date;
  /** Inclusive start of the equal-length preceding window (for deltas). */
  prevStart: Date;
  /** Bucket granularity the revenue series is grouped by. */
  bucket: 'day' | 'week' | 'month';
}

/**
 * Read side of the admin console's Analytics screen.
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every aggregate below
 * is auto-constrained to the caller's gym by the Prisma tenant extension, so the
 * whole report is this-gym-only by construction — there is no `gymId` to pass or
 * to forget, exactly like {@link DashboardService}.
 *
 * Every figure is a REAL aggregation over rows that already exist:
 *   • revenue / revenueSeries / channelMix — captured {@link Payment} rows.
 *   • activeMembers                         — {@link GymMember} snapshot + joins.
 *   • attendanceRate / topClasses          — {@link Booking} / {@link ClassInstance}.
 *   • churn / planMix                       — {@link Subscription} rows.
 *
 * Where the schema has no source yet (e.g. subscription cash — recurring billing
 * is stubbed and writes no Payment rows), the section is simply absent from the
 * channel split rather than fabricated (see the header of `@fit/types` analytics).
 */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: TenantPrismaService) {}

  /** One range-windowed analytics snapshot for the gym's dashboards + charts. */
  async getAnalytics(
    range: AnalyticsRange = DEFAULT_ANALYTICS_RANGE,
  ): Promise<AdminAnalyticsResponse> {
    const win = resolveWindow(range);

    const [
      currency,
      revenue,
      activeMembers,
      attendanceRate,
      churn,
      revenueSeries,
      channelMix,
      planMix,
      topClasses,
    ] = await Promise.all([
      this.resolveCurrency(),
      this.revenueKpi(win),
      this.activeMembersKpi(win),
      this.attendanceRateKpi(win),
      this.churnKpi(win),
      this.revenueSeries(win),
      this.channelMix(win),
      this.planMix(),
      this.topClasses(win),
    ]);

    return {
      range,
      currency,
      kpis: { revenue, activeMembers, attendanceRate, churn },
      revenueSeries,
      channelMix,
      planMix,
      topClasses,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  KPIs                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * The gym's reporting currency. Read from the most recent captured payment (the
   * real currency money changed hands in); falls back to the schema default `USD`
   * when the gym has taken no payments yet, so the empty-state UI still labels its
   * zeros. Not fabricated — it is the currency of an actual row when one exists.
   */
  private async resolveCurrency(): Promise<string> {
    const db = this.prisma.client;
    const latest = await db.payment.findFirst({
      where: { status: PaymentStatus.CAPTURED },
      orderBy: { createdAt: 'desc' },
      select: { currency: true },
    });
    return latest?.currency ?? 'USD';
  }

  /** Captured revenue in the window, with a delta vs. the previous equal window. */
  private async revenueKpi(win: WindowSpec): Promise<AnalyticsKpi> {
    const db = this.prisma.client;
    const [current, previous] = await Promise.all([
      db.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.prevStart, lt: win.start } },
        _sum: { amount: true },
      }),
    ]);
    const value = current._sum.amount ?? 0;
    return { value, deltaPct: pctDelta(value, previous._sum.amount ?? 0) };
  }

  /**
   * Active members — a live snapshot count (role MEMBER, status ACTIVE). The delta
   * compares members who *joined* in this window against the previous one (the only
   * time-attributable member signal the schema carries via `joinedAt`).
   */
  private async activeMembersKpi(win: WindowSpec): Promise<AnalyticsKpi> {
    const db = this.prisma.client;
    const [active, joinedNow, joinedPrev] = await Promise.all([
      db.gymMember.count({ where: { role: Role.MEMBER, status: 'ACTIVE' } }),
      db.gymMember.count({
        where: { role: Role.MEMBER, joinedAt: { gte: win.start, lt: win.end } },
      }),
      db.gymMember.count({
        where: { role: Role.MEMBER, joinedAt: { gte: win.prevStart, lt: win.start } },
      }),
    ]);
    return { value: active, deltaPct: pctDelta(joinedNow, joinedPrev) };
  }

  /**
   * Attendance rate — ATTENDED / (ATTENDED + NO_SHOW) over bookings on class
   * instances that started in the window, as a 0–100 percentage. The delta
   * compares the same rate over the previous window.
   */
  private async attendanceRateKpi(win: WindowSpec): Promise<AnalyticsKpi> {
    const db = this.prisma.client;
    const rateFor = async (from: Date, to: Date): Promise<number | null> => {
      const [attended, noShow] = await Promise.all([
        db.booking.count({
          where: {
            status: BookingStatus.ATTENDED,
            classInstance: { startsAt: { gte: from, lt: to } },
          },
        }),
        db.booking.count({
          where: {
            status: BookingStatus.NO_SHOW,
            classInstance: { startsAt: { gte: from, lt: to } },
          },
        }),
      ]);
      const denom = attended + noShow;
      return denom === 0 ? null : (attended / denom) * 100;
    };

    const [current, previous] = await Promise.all([
      rateFor(win.start, win.end),
      rateFor(win.prevStart, win.start),
    ]);
    const value = current ?? 0;
    const deltaPct = current === null || previous === null ? null : pctDelta(current, previous);
    return { value: round1(value), deltaPct };
  }

  /**
   * Churn rate — subscriptions that moved to CANCELED/EXPIRED in the window over
   * the number live at the window's start, as a 0–100 percentage. "Live at start"
   * is approximated by the subscriptions created before the window that are not
   * already terminal, which is the closest the current schema supports without a
   * status-transition log.
   */
  private async churnKpi(win: WindowSpec): Promise<AnalyticsKpi> {
    const db = this.prisma.client;
    const churnFor = async (from: Date, to: Date): Promise<number | null> => {
      const [churned, base] = await Promise.all([
        db.subscription.count({
          where: {
            OR: [
              { status: SubscriptionStatus.CANCELED, canceledAt: { gte: from, lt: to } },
              { status: SubscriptionStatus.EXPIRED, updatedAt: { gte: from, lt: to } },
            ],
          },
        }),
        db.subscription.count({ where: { createdAt: { lt: from } } }),
      ]);
      return base === 0 ? null : (churned / base) * 100;
    };

    const [current, previous] = await Promise.all([
      churnFor(win.start, win.end),
      churnFor(win.prevStart, win.start),
    ]);
    const value = current ?? 0;
    const deltaPct = current === null || previous === null ? null : pctDelta(current, previous);
    return { value: round1(value), deltaPct };
  }

  /* ---------------------------------------------------------------------- */
  /*  Series + breakdowns                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * Captured revenue bucketed across the window. Fetches the raw captured payment
   * timestamps + amounts once (index-served by `(gymId, createdAt)`) and buckets in
   * memory into a dense, gap-filled series so the chart's x-axis is continuous even
   * on days/weeks with no takings.
   */
  private async revenueSeries(win: WindowSpec): Promise<AnalyticsPoint[]> {
    const db = this.prisma.client;
    const rows = await db.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      select: { amount: true, createdAt: true },
    });

    const buckets = emptyBuckets(win);
    for (const row of rows) {
      const key = bucketKey(row.createdAt, win.bucket);
      const bucket = buckets.get(key);
      if (bucket !== undefined) {
        buckets.set(key, bucket + row.amount);
      }
    }
    return [...buckets.entries()].map(([date, value]) => ({ date, value }));
  }

  /**
   * Captured revenue split by sales channel. Payments carry no channel column — it
   * is derived from the payment provider key ({@link deriveOrderChannel}: `"pos"` ⇒
   * POS, everything else ⇒ ONLINE), matching the order roster's own channel filter.
   * Only channels with real captured rows appear; a channel with no takings is
   * omitted rather than shown as a fabricated zero.
   */
  private async channelMix(win: WindowSpec): Promise<AnalyticsChannelSlice[]> {
    const db = this.prisma.client;
    const rows = await db.payment.groupBy({
      by: ['provider'],
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      _sum: { amount: true },
    });

    const totals = new Map<OrderChannel, number>();
    for (const row of rows) {
      const channel = deriveOrderChannel(row.provider);
      totals.set(channel, (totals.get(channel) ?? 0) + (row._sum.amount ?? 0));
    }
    return [...totals.entries()]
      .map(([channel, amount]) => ({ channel, amount }))
      .sort((a, b) => b.amount - a.amount);
  }

  /**
   * Live subscribers grouped by their catalogue plan (a snapshot, not windowed —
   * the plan mix is a "who is subscribed right now" breakdown). Counts subscriptions
   * in a live state (TRIAL / ACTIVE / PAST_DUE / FROZEN), then labels each plan id
   * with its name; a subscription whose plan was deleted rolls up under `"No plan"`.
   */
  private async planMix(): Promise<AnalyticsPlanSlice[]> {
    const db = this.prisma.client;
    const grouped = await db.subscription.groupBy({
      by: ['planId'],
      where: {
        status: {
          in: [
            SubscriptionStatus.TRIAL,
            SubscriptionStatus.ACTIVE,
            SubscriptionStatus.PAST_DUE,
            SubscriptionStatus.FROZEN,
          ],
        },
      },
      _count: { _all: true },
    });
    if (grouped.length === 0) {
      return [];
    }

    const planIds = grouped.map((g) => g.planId).filter((id): id is string => id !== null);
    const plans =
      planIds.length === 0
        ? []
        : await db.subscriptionPlan.findMany({
            where: { id: { in: planIds } },
            select: { id: true, name: true },
          });
    const nameById = new Map(plans.map((p) => [p.id, p.name]));

    return grouped
      .map((g) => ({
        planId: g.planId,
        name: g.planId === null ? 'No plan' : (nameById.get(g.planId) ?? 'Deleted plan'),
        subscribers: g._count._all,
      }))
      .sort((a, b) => b.subscribers - a.subscribers);
  }

  /**
   * The most-booked classes in the window. Counts confirmed + attended bookings on
   * instances that started in-range, grouped by the instance's template, then labels
   * the top templates with their title. Ranked by booking volume, top 5.
   */
  private async topClasses(win: WindowSpec): Promise<AnalyticsTopClass[]> {
    const db = this.prisma.client;
    // Booking → ClassInstance → ClassTemplate. Group by the instance's template id,
    // fetched alongside the booking, since Prisma groupBy can't reach a relation's
    // scalar directly.
    const rows = await db.booking.findMany({
      where: {
        status: { in: [BookingStatus.BOOKED, BookingStatus.ATTENDED] },
        classInstance: { startsAt: { gte: win.start, lt: win.end } },
      },
      select: { classInstance: { select: { templateId: true } } },
    });

    const counts = new Map<string, number>();
    for (const row of rows) {
      const templateId = row.classInstance.templateId;
      // Single occurrences scheduled straight from a type carry no template, so
      // they aren't grouped into this template-ranked "top classes" list.
      if (!templateId) {
        continue;
      }
      counts.set(templateId, (counts.get(templateId) ?? 0) + 1);
    }
    if (counts.size === 0) {
      return [];
    }

    const templates = await db.classTemplate.findMany({
      where: { id: { in: [...counts.keys()] } },
      select: { id: true, title: true },
    });
    const titleById = new Map(templates.map((t) => [t.id, t.title]));

    return [...counts.entries()]
      .map(([templateId, bookings]) => ({
        templateId,
        title: titleById.get(templateId) ?? 'Deleted class',
        bookings,
      }))
      .sort((a, b) => b.bookings - a.bookings)
      .slice(0, 5);
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure window / bucket helpers                                               */
/* -------------------------------------------------------------------------- */

/** Resolve a range token into a concrete window + bucket granularity (UTC). */
function resolveWindow(range: AnalyticsRange): WindowSpec {
  const end = new Date();
  switch (range) {
    case '7d': {
      const start = new Date(end.getTime() - 7 * DAY_MS);
      return { start, end, prevStart: new Date(start.getTime() - 7 * DAY_MS), bucket: 'day' };
    }
    case '30d': {
      const start = new Date(end.getTime() - 30 * DAY_MS);
      return { start, end, prevStart: new Date(start.getTime() - 30 * DAY_MS), bucket: 'day' };
    }
    case '12w': {
      const start = new Date(end.getTime() - 12 * 7 * DAY_MS);
      return { start, end, prevStart: new Date(start.getTime() - 12 * 7 * DAY_MS), bucket: 'week' };
    }
    case '12m': {
      const start = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 12, end.getUTCDate()),
      );
      const prevStart = new Date(
        Date.UTC(end.getUTCFullYear(), end.getUTCMonth() - 24, end.getUTCDate()),
      );
      return { start, end, prevStart, bucket: 'month' };
    }
  }
}

/** The `YYYY-MM-DD` bucket key an instant falls into, at the given granularity (UTC). */
function bucketKey(at: Date, bucket: 'day' | 'week' | 'month'): string {
  if (bucket === 'month') {
    return isoDate(new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1)));
  }
  if (bucket === 'week') {
    // Monday-start week: shift back to the week's Monday (UTC).
    const day = at.getUTCDay(); // 0 = Sun … 6 = Sat
    const mondayOffset = (day + 6) % 7;
    const monday = new Date(
      Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate() - mondayOffset),
    );
    return isoDate(monday);
  }
  return isoDate(at);
}

/** A dense, zero-filled bucket map spanning the window, keyed by bucket start. */
function emptyBuckets(win: WindowSpec): Map<string, number> {
  const buckets = new Map<string, number>();
  if (win.bucket === 'month') {
    let cursor = new Date(Date.UTC(win.start.getUTCFullYear(), win.start.getUTCMonth(), 1));
    while (cursor < win.end) {
      buckets.set(isoDate(cursor), 0);
      cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
    }
    return buckets;
  }
  const step = win.bucket === 'week' ? 7 * DAY_MS : DAY_MS;
  // Anchor to the first bucket's start so day/week keys line up with `bucketKey`.
  const firstKey = bucketKey(win.start, win.bucket);
  let cursorMs = new Date(`${firstKey}T00:00:00.000Z`).getTime();
  while (cursorMs < win.end.getTime()) {
    buckets.set(isoDate(new Date(cursorMs)), 0);
    cursorMs += step;
  }
  return buckets;
}

/** Format an instant as its `YYYY-MM-DD` UTC date. */
function isoDate(at: Date): string {
  return at.toISOString().slice(0, 10);
}

/**
 * Period-over-period percent change, rounded to one decimal. `null` when there is
 * no prior baseline (`previous === 0`) so the UI hides the chip rather than
 * showing a misleading `∞` / `0%`.
 */
function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) {
    return null;
  }
  return round1(((current - previous) / previous) * 100);
}

/** Round to one decimal place. */
function round1(n: number): number {
  return Math.round(n * 10) / 10;
}
