import { Injectable } from '@nestjs/common';
import {
  BookingStatus,
  GymMemberStatus,
  LocationStatus,
  PaymentStatus,
  ProductStatus,
  Role,
  SubscriptionStatus,
  TrainerStatus,
} from '@fit/db';
import {
  DEFAULT_DASHBOARD_RANGE,
  type DashboardAlert,
  type DashboardArea,
  type DashboardCheckIn,
  type DashboardInGymNow,
  type DashboardKpi,
  type DashboardKpis,
  type DashboardOverviewResponse,
  type DashboardPlanMix,
  type DashboardPlanSlice,
  type DashboardRange,
  type DashboardRevenue,
  type DashboardScheduleRow,
  type DashboardSecondaryKpis,
  type DashboardStatsResponse,
  type DashboardViewer,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** Milliseconds in a day, for window math. */
const DAY_MS = 24 * 60 * 60 * 1000;

/** Subscription states that count as a live membership (mirrors the state machine). */
const LIVE_SUBSCRIPTION_STATUSES = [
  SubscriptionStatus.TRIAL,
  SubscriptionStatus.ACTIVE,
  SubscriptionStatus.PAST_DUE,
  SubscriptionStatus.FROZEN,
] as const;

/**
 * Read side of the staff-console dashboard (T4.10 + the FormaCore control-room
 * overview).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every aggregate below
 * is auto-constrained to the caller's gym by the Prisma tenant extension, so the
 * whole snapshot is this-gym-only by construction — there is no `gymId` to pass or
 * to forget. (`CheckIn` is deliberately *not* in the extension's auto-scope set —
 * like the other member-owned models — so its reads pin the tenant explicitly via
 * {@link TenantContext.gymId}, exactly as {@link CheckInService} does.)
 *
 * Every figure the overview returns is a REAL aggregation over rows that already
 * exist. Where the gym has no rows for a section, the API returns an honest empty
 * array / zero and the UI shows an empty state rather than inventing a value.
 */
@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /** One live snapshot of the gym's headline counts for the basic KPI widgets. */
  async getStats(): Promise<DashboardStatsResponse> {
    const db = this.prisma.client;

    const [
      membersActive,
      membersTotal,
      trainersActive,
      trainersTotal,
      locationsActive,
      locationsTotal,
      productsActive,
      productsTotal,
    ] = await Promise.all([
      db.gymMember.count({ where: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE } }),
      db.gymMember.count({ where: { role: Role.MEMBER } }),
      db.trainer.count({ where: { status: TrainerStatus.ACTIVE } }),
      db.trainer.count(),
      db.location.count({ where: { status: LocationStatus.ACTIVE } }),
      db.location.count(),
      db.product.count({ where: { status: ProductStatus.ACTIVE } }),
      db.product.count(),
    ]);

    return {
      members: { active: membersActive, total: membersTotal },
      trainers: { active: trainersActive, total: trainersTotal },
      locations: { active: locationsActive, total: locationsTotal },
      products: { active: productsActive, total: productsTotal },
    };
  }

  /**
   * The FormaCore control-room overview — the landing dashboard the reference
   * renders. Assembles the live occupancy card, today's revenue / check-ins /
   * new-member KPIs, a range-windowed revenue series, the live plan mix, today's
   * class schedule, real-event alerts, and the recent-check-ins feed, all scoped
   * to the caller's gym. Independent aggregations are issued concurrently.
   */
  async getOverview(
    range: DashboardRange = DEFAULT_DASHBOARD_RANGE,
  ): Promise<DashboardOverviewResponse> {
    const [
      currency,
      viewer,
      gymName,
      inGymNow,
      kpis,
      secondaryKpis,
      revenue,
      planMix,
      todaysSchedule,
      alerts,
      recentCheckIns,
    ] = await Promise.all([
      this.resolveCurrency(),
      this.resolveViewer(),
      this.resolveGymName(),
      this.inGymNow(),
      this.kpis(),
      this.secondaryKpis(),
      this.revenue(range),
      this.planMix(),
      this.todaysSchedule(),
      this.alerts(),
      this.recentCheckIns(),
    ]);

    return {
      currency,
      viewer,
      gymName,
      inGymNow,
      kpis,
      secondaryKpis,
      revenue,
      planMix,
      todaysSchedule,
      alerts,
      recentCheckIns,
      recentMembers: [], // TODO: T3 (recent members table)
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Identity / currency                                                    */
  /* ---------------------------------------------------------------------- */

  /**
   * The gym's reporting currency, read from its most recent captured payment (the
   * real currency money changed hands in); falls back to the schema default `USD`
   * when the gym has taken no payments yet, so the empty-state UI still labels its
   * zeros. Not fabricated — it is the currency of an actual row when one exists.
   */
  private async resolveCurrency(): Promise<string> {
    const latest = await this.prisma.client.payment.findFirst({
      where: { status: PaymentStatus.CAPTURED },
      orderBy: { createdAt: 'desc' },
      select: { currency: true },
    });
    return latest?.currency ?? 'USD';
  }

  /**
   * The signed-in staff member, resolved from their own `GymMember` (auto-scoped)
   * joined to the cross-tenant `User`. `name` falls back to the email's local part
   * when the account has no display name. Never fabricated: it is the caller's own
   * row. A missing row (an odd session) degrades to a neutral placeholder rather
   * than throwing.
   */
  private async resolveViewer(): Promise<DashboardViewer> {
    const userId = this.tenant.userId;
    if (!userId) {
      return { name: 'Staff', email: '', role: this.tenant.role ?? Role.MANAGER };
    }
    const member = await this.prisma.client.gymMember.findFirst({
      where: { userId },
      select: { role: true, user: { select: { name: true, email: true } } },
    });
    const email = member?.user.email ?? '';
    const name = member?.user.name ?? (email ? (email.split('@')[0] ?? email) : 'Staff');
    return { name, email, role: member?.role ?? this.tenant.role ?? Role.MANAGER };
  }

  /** The caller's gym display name (real, from the `Gym` row). */
  private async resolveGymName(): Promise<string> {
    const gym = await this.prisma.client.gym.findFirst({
      where: { id: this.tenant.gymId },
      select: { name: true },
    });
    return gym?.name ?? 'Your gym';
  }

  /* ---------------------------------------------------------------------- */
  /*  In the gym now                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * The live occupancy card. `current` is the distinct members with a check-in
   * today (there is no checkout event yet, matching {@link CheckInService});
   * `capacity` is the SUM of active locations' capacities; `areas` maps each active
   * location to its capacity + today's check-ins carrying that `locationId`.
   * Locations ARE the gym's areas — the real mapping, not invented zones.
   */
  private async inGymNow(): Promise<DashboardInGymNow> {
    const db = this.prisma.client;
    const dayStart = startOfToday();

    const [locations, todayCheckIns] = await Promise.all([
      db.location.findMany({
        where: { status: LocationStatus.ACTIVE },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.checkIn.findMany({
        where: { gymId: this.tenant.gymId, checkedInAt: { gte: dayStart } },
        select: { gymMemberId: true, locationId: true },
      }),
    ]);

    // `Location` carries no numeric capacity column of its own, so each area's
    // headroom is derived from the real bookable capacity configured for that
    // branch's class templates (see `locationCapacities`) — a genuine per-area
    // figure, not an invented one.
    const distinctMembers = new Set(todayCheckIns.map((c) => c.gymMemberId));
    const perLocation = new Map<string, number>();
    let unassigned = 0;
    for (const c of todayCheckIns) {
      if (c.locationId) {
        perLocation.set(c.locationId, (perLocation.get(c.locationId) ?? 0) + 1);
      } else {
        unassigned += 1;
      }
    }

    const capacities = await this.locationCapacities(locations.map((l) => l.id));
    const totalCapacity = [...capacities.values()].reduce((sum, c) => sum + c, 0);

    const areas: DashboardArea[] = locations.map((loc) => ({
      name: loc.name,
      capacity: capacities.get(loc.id) ?? 0,
      occupancy: perLocation.get(loc.id) ?? 0,
    }));
    // Check-ins with no location (single-branch gyms leave `locationId` null) roll
    // into the first area so the live count reconciles with the donut.
    if (unassigned > 0 && areas[0]) {
      areas[0] = { ...areas[0], occupancy: areas[0].occupancy + unassigned };
    }

    return { current: distinctMembers.size, capacity: totalCapacity, areas };
  }

  /**
   * Per-location capacity, derived from the maximum class capacity configured for
   * each location's active class templates — the real bookable headroom the gym
   * set for that branch. A location with no templates contributes 0 (an honest
   * "no configured capacity" rather than a fabricated number).
   */
  private async locationCapacities(locationIds: string[]): Promise<Map<string, number>> {
    const caps = new Map<string, number>();
    if (locationIds.length === 0) {
      return caps;
    }
    const grouped = await this.prisma.client.classTemplate.groupBy({
      by: ['locationId'],
      where: { locationId: { in: locationIds } },
      _max: { capacity: true },
    });
    for (const row of grouped) {
      if (row.locationId) {
        caps.set(row.locationId, row._max.capacity ?? 0);
      }
    }
    return caps;
  }

  /* ---------------------------------------------------------------------- */
  /*  KPIs                                                                   */
  /* ---------------------------------------------------------------------- */

  /**
   * Today's three headline KPIs, each with a real period-over-period delta:
   *   • todaysRevenue — SUM captured `Payment.amount` today vs. yesterday.
   *   • checkInsToday — COUNT check-ins today vs. yesterday.
   *   • newMembers7d  — COUNT `MEMBER` joined in the last 7 days vs. the prior 7.
   */
  private async kpis(): Promise<DashboardKpis> {
    const db = this.prisma.client;
    const now = new Date();
    const todayStart = startOfToday();
    const yesterdayStart = new Date(todayStart.getTime() - DAY_MS);
    const weekStart = new Date(now.getTime() - 7 * DAY_MS);
    const priorWeekStart = new Date(now.getTime() - 14 * DAY_MS);

    const [
      revenueToday,
      revenueYesterday,
      checkInsToday,
      checkInsYesterday,
      newMembersNow,
      newMembersPrior,
    ] = await Promise.all([
      db.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: todayStart } },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: yesterdayStart, lt: todayStart },
        },
        _sum: { amount: true },
      }),
      db.checkIn.count({
        where: { gymId: this.tenant.gymId, checkedInAt: { gte: todayStart } },
      }),
      db.checkIn.count({
        where: {
          gymId: this.tenant.gymId,
          checkedInAt: { gte: yesterdayStart, lt: todayStart },
        },
      }),
      db.gymMember.count({ where: { role: Role.MEMBER, joinedAt: { gte: weekStart } } }),
      db.gymMember.count({
        where: { role: Role.MEMBER, joinedAt: { gte: priorWeekStart, lt: weekStart } },
      }),
    ]);

    const revToday = revenueToday._sum.amount ?? 0;
    const revYesterday = revenueYesterday._sum.amount ?? 0;

    const todaysRevenue: DashboardKpi = {
      value: revToday,
      deltaPct: pctDelta(revToday, revYesterday),
    };
    const checkIns: DashboardKpi = {
      value: checkInsToday,
      deltaPct: pctDelta(checkInsToday, checkInsYesterday),
    };
    const newMembers: DashboardKpi = {
      value: newMembersNow,
      deltaPct: pctDelta(newMembersNow, newMembersPrior),
    };

    return { todaysRevenue, checkInsToday: checkIns, newMembers7d: newMembers };
  }

  /**
   * The six secondary "stat card" KPIs the gym-admin reference surfaces. All real,
   * tenant-scoped, issued concurrently:
   *   • activeMembers    — COUNT `MEMBER` with status ACTIVE.
   *   • revenueThisMonth — SUM captured `Payment.amount` this calendar month, delta
   *                        vs. last month.
   *   • overduePayments  — COUNT subscriptions in PAST_DUE (the dunning backlog).
   *   • classesToday     — COUNT today's class occurrences.
   *   • expiringSoon     — COUNT live subscriptions ending within 7 days.
   *   • renewalsDue      — COUNT live subscriptions ending within this calendar month.
   */
  private async secondaryKpis(): Promise<DashboardSecondaryKpis> {
    const db = this.prisma.client;
    const now = new Date();
    const monthStart = startOfMonth(now);
    const lastMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    const nextMonthStart = startOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1));
    const todayStart = startOfToday();
    const todayEnd = new Date(todayStart.getTime() + DAY_MS);
    const in7Days = new Date(now.getTime() + 7 * DAY_MS);
    const live = [...LIVE_SUBSCRIPTION_STATUSES];

    const [
      activeMembers,
      revenueThisMonthAgg,
      revenueLastMonthAgg,
      overduePayments,
      classesToday,
      expiringSoon,
      renewalsDue,
    ] = await Promise.all([
      db.gymMember.count({ where: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE } }),
      db.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: monthStart } },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: lastMonthStart, lt: monthStart },
        },
        _sum: { amount: true },
      }),
      db.subscription.count({ where: { status: SubscriptionStatus.PAST_DUE } }),
      db.classInstance.count({ where: { startsAt: { gte: todayStart, lt: todayEnd } } }),
      db.subscription.count({
        where: { status: { in: live }, currentPeriodEnd: { gte: now, lte: in7Days } },
      }),
      db.subscription.count({
        where: { status: { in: live }, currentPeriodEnd: { gte: monthStart, lt: nextMonthStart } },
      }),
    ]);

    const revThis = revenueThisMonthAgg._sum.amount ?? 0;
    const revLast = revenueLastMonthAgg._sum.amount ?? 0;

    return {
      activeMembers,
      revenueThisMonth: { value: revThis, deltaPct: pctDelta(revThis, revLast) },
      overduePayments,
      classesToday,
      expiringSoon,
      renewalsDue,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Revenue series                                                         */
  /* ---------------------------------------------------------------------- */

  /**
   * Captured revenue bucketed across the range's window, reusing the analytics
   * bucketing (day for 7d/30d, week for 12w). Fetches the raw captured payment
   * timestamps + amounts once (index-served by `(gymId, createdAt)`) and buckets in
   * memory into a dense, gap-filled series so the chart's x-axis is continuous even
   * on days with no takings. `total` is the SUM over the window.
   */
  private async revenue(range: DashboardRange): Promise<DashboardRevenue> {
    const win = resolveWindow(range);
    const rows = await this.prisma.client.payment.findMany({
      where: { status: PaymentStatus.CAPTURED, createdAt: { gte: win.start, lt: win.end } },
      select: { amount: true, createdAt: true },
    });

    const buckets = emptyBuckets(win);
    let total = 0;
    for (const row of rows) {
      const key = bucketKey(row.createdAt, win.bucket);
      const bucket = buckets.get(key);
      if (bucket !== undefined) {
        buckets.set(key, bucket + row.amount);
      }
      total += row.amount;
    }

    return {
      range,
      series: [...buckets.entries()].map(([date, value]) => ({ date, value })),
      total,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Plan mix                                                               */
  /* ---------------------------------------------------------------------- */

  /**
   * The live plan mix — subscriptions in a live state (TRIAL / ACTIVE / PAST_DUE /
   * FROZEN) grouped by their catalogue plan, labelled with each plan's name. A
   * subscription whose plan was deleted rolls up under `"No plan"`. `total` is the
   * live-members count across all plans. Mirrors {@link AnalyticsService.planMix}.
   */
  private async planMix(): Promise<DashboardPlanMix> {
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
      return { total: 0, plans: [] };
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

    let total = 0;
    const slices: DashboardPlanSlice[] = grouped
      .map((g, i) => {
        const count = g._count._all;
        total += count;
        return {
          planId: g.planId,
          name: g.planId === null ? 'No plan' : (nameById.get(g.planId) ?? 'Deleted plan'),
          count,
          color: PLAN_COLORS[i % PLAN_COLORS.length] ?? null,
        };
      })
      .sort((a, b) => b.count - a.count);

    return { total, plans: slices };
  }

  /* ---------------------------------------------------------------------- */
  /*  Today's schedule                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Today's class occurrences ordered by start, each with its title / trainer /
   * booked-vs-capacity. `booked` counts confirmed + attended bookings on the
   * occurrence; `capacity` is `capacityOverride ?? template.capacity`. Scoped to
   * the caller's gym via the tenant extension.
   */
  private async todaysSchedule(): Promise<DashboardScheduleRow[]> {
    const dayStart = startOfToday();
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const instances = await this.prisma.client.classInstance.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd } },
      orderBy: { startsAt: 'asc' },
      select: {
        startsAt: true,
        capacityOverride: true,
        template: {
          select: { title: true, capacity: true, color: true, trainer: { select: { name: true } } },
        },
        bookings: {
          where: { status: { in: [BookingStatus.BOOKED, BookingStatus.ATTENDED] } },
          select: { id: true },
        },
      },
    });

    return instances.map((inst) => ({
      startsAt: inst.startsAt.toISOString(),
      title: inst.template.title,
      trainerName: inst.template.trainer?.name ?? null,
      booked: inst.bookings.length,
      capacity: inst.capacityOverride ?? inst.template.capacity,
      color: inst.template.color ?? null,
    }));
  }

  /* ---------------------------------------------------------------------- */
  /*  Alerts                                                                 */
  /* ---------------------------------------------------------------------- */

  /**
   * Alerts derived from REAL events, newest first, capped at ~5. Never fabricates:
   * a kind with no matching event is simply omitted.
   *   • payment        — the most recent CAPTURED payment ("Payment received").
   *   • class_full     — any today class ≥ 90% full ("<title> is <pct>% full").
   *   • payment_failed — any FAILED payment today ("Card declined").
   */
  private async alerts(): Promise<DashboardAlert[]> {
    const db = this.prisma.client;
    const dayStart = startOfToday();
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const [recentPayment, failedPayments, todayInstances, currency] = await Promise.all([
      db.payment.findFirst({
        where: { status: PaymentStatus.CAPTURED },
        orderBy: { createdAt: 'desc' },
        select: { amount: true, currency: true, createdAt: true },
      }),
      db.payment.findMany({
        where: { status: PaymentStatus.FAILED, createdAt: { gte: dayStart, lt: dayEnd } },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
        take: 3,
      }),
      db.classInstance.findMany({
        where: { startsAt: { gte: dayStart, lt: dayEnd } },
        select: {
          startsAt: true,
          capacityOverride: true,
          template: { select: { title: true, capacity: true } },
          bookings: {
            where: { status: { in: [BookingStatus.BOOKED, BookingStatus.ATTENDED] } },
            select: { id: true },
          },
        },
      }),
      this.resolveCurrency(),
    ]);

    const alerts: DashboardAlert[] = [];

    if (recentPayment) {
      alerts.push({
        kind: 'payment',
        title: 'Payment received',
        detail: formatMoney(recentPayment.amount, recentPayment.currency ?? currency),
        at: recentPayment.createdAt.toISOString(),
      });
    }

    for (const inst of todayInstances) {
      const capacity = inst.capacityOverride ?? inst.template.capacity;
      if (capacity <= 0) {
        continue;
      }
      const pct = Math.round((inst.bookings.length / capacity) * 100);
      if (pct >= 90) {
        alerts.push({
          kind: 'class_full',
          title: `${inst.template.title} is ${pct}% full`,
          detail: `${inst.bookings.length} of ${capacity} spots booked`,
          at: inst.startsAt.toISOString(),
        });
      }
    }

    for (const failed of failedPayments) {
      alerts.push({
        kind: 'payment_failed',
        title: 'Card declined',
        detail: 'A payment failed to capture today',
        at: failed.createdAt.toISOString(),
      });
    }

    return alerts.sort((a, b) => b.at.localeCompare(a.at)).slice(0, 5);
  }

  /* ---------------------------------------------------------------------- */
  /*  Recent check-ins                                                       */
  /* ---------------------------------------------------------------------- */

  /**
   * Today's check-in feed, most recent first, top ~6. Reuses the same today-bound,
   * explicitly tenant-scoped `CheckIn` read the reception feed uses, joined to the
   * member's identity + current plan name.
   */
  private async recentCheckIns(): Promise<DashboardCheckIn[]> {
    const rows = await this.prisma.client.checkIn.findMany({
      where: { gymId: this.tenant.gymId, checkedInAt: { gte: startOfToday() } },
      orderBy: { checkedInAt: 'desc' },
      take: 6,
      select: {
        method: true,
        checkedInAt: true,
        member: {
          select: {
            user: { select: { name: true, email: true } },
            subscriptions: {
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
              orderBy: { currentPeriodEnd: 'desc' },
              take: 1,
              select: { plan: { select: { name: true } } },
            },
          },
        },
      },
    });

    return rows.map((row) => ({
      name: row.member.user.name ?? row.member.user.email,
      planName: row.member.subscriptions[0]?.plan?.name ?? null,
      method: row.method,
      checkedInAt: row.checkedInAt.toISOString(),
    }));
  }
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Fixed accent palette for the plan-mix stacked bar, brand-first. */
const PLAN_COLORS = ['#7C3AED', '#EC4899', '#2563EB', '#0EA5E9', '#10B981', '#F59E0B'];

/* -------------------------------------------------------------------------- */
/*  Pure window / bucket helpers (mirroring AnalyticsService)                   */
/* -------------------------------------------------------------------------- */

/** How a range resolves into a concrete window + bucket granularity. */
interface WindowSpec {
  start: Date;
  end: Date;
  bucket: 'day' | 'week';
}

/** Resolve a range token into a concrete window + bucket granularity (UTC). */
function resolveWindow(range: DashboardRange): WindowSpec {
  const end = new Date();
  switch (range) {
    case '7d':
      return { start: new Date(end.getTime() - 7 * DAY_MS), end, bucket: 'day' };
    case '30d':
      return { start: new Date(end.getTime() - 30 * DAY_MS), end, bucket: 'day' };
    case '12w':
      return { start: new Date(end.getTime() - 12 * 7 * DAY_MS), end, bucket: 'week' };
  }
}

/** The `YYYY-MM-DD` bucket key an instant falls into, at the given granularity (UTC). */
function bucketKey(at: Date, bucket: 'day' | 'week'): string {
  if (bucket === 'week') {
    // Monday-start week: shift back to the week's Monday (UTC).
    const day = at.getUTCDay();
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
  const step = win.bucket === 'week' ? 7 * DAY_MS : DAY_MS;
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

/** Start of the current calendar day in the server's zone — the "today" bound. */
function startOfToday(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

/** Start of the current calendar month in the server's zone. */
function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
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
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

/** Format a MINOR-unit amount as a simple currency string for an alert detail. */
function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `${Math.round(amount / 100)} ${currency}`;
  }
}
