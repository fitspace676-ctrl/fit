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
  DEFAULT_DASHBOARD_PERIOD,
  type DashboardAlert,
  type DashboardArea,
  type DashboardCheckIn,
  type DashboardInGymNow,
  type DashboardKpi,
  type DashboardKpis,
  type DashboardOverviewQuery,
  type DashboardOverviewResponse,
  type DashboardPeriod,
  type DashboardPlanMix,
  type DashboardPlanSlice,
  type DashboardRange,
  type DashboardRecentMember,
  type DashboardRevenue,
  type DashboardScheduleRow,
  type DashboardSecondaryKpis,
  type DashboardStatsResponse,
  type DashboardViewer,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { bucketKey, emptyBuckets, resolveWindow } from '../reports/report-window.util';
import { addZonedDays, zonedDayStart, zonedIsoDate, zonedParts } from '../reports/zoned-time.util';
import { atLocation, memberAtLocation } from '../common/location-filter.util';

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
 * to forget. (`CheckIn` used to be outside that auto-scope set, so its reads below
 * pin the tenant explicitly via {@link TenantContext.gymId}. The 2026-08-30 audit
 * of `TENANT_SCOPED_MODELS` added it; those pins are now redundant rather than
 * load-bearing — the extension overwrites them with the identical value — and are
 * left in place, as that audit did everywhere else, because they also satisfy the
 * static types and cost nothing.)
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
    private readonly locales: GymLocaleService,
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
      db.gymMember.count({
        where: { role: Role.MEMBER, status: GymMemberStatus.ACTIVE, deletedAt: null },
      }),
      db.gymMember.count({ where: { role: Role.MEMBER, deletedAt: null } }),
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
   *
   * **`query.locationId` narrows the sections that have a branch to narrow by, and
   * ONLY those.** See `common/location-filter.util.ts` for the attribution rule and
   * for why the rest cannot be. On this endpoint the split is clean — every KPI
   * below is one read, so none of them ends up half branch-scoped and half gym-wide:
   *
   * | Branch-scoped when `locationId` is given | Always gym-wide |
   * |---|---|
   * | `kpis.todaysRevenue` (`Payment`, own column — Stage 5) | — nothing on this endpoint |
   * | `kpis.checkInsToday` (`CheckIn`, own column — Stage 3) | |
   * | `kpis.newMembers7d` (`GymMember`) | |
   * | `secondaryKpis.revenueThisMonth` (`Payment`, own column — Stage 5) | |
   * | `secondaryKpis.activeMembers` (`GymMember`) | |
   * | `secondaryKpis.classesToday` (`ClassInstance`) | |
   * | `secondaryKpis.overduePayments` / `expiringSoon` / `renewalsDue` (`Subscription` → member) | |
   * | `revenue` series + total (`Payment`, own column — Stage 5) | |
   * | `planMix` (`Subscription` → member) | |
   * | `todaysSchedule` (`ClassInstance`) | |
   * | `recentMembers` (`GymMember`) | |
   * | `inGymNow` (`CheckIn`, own column — see {@link inGymNow}) | |
   * | `recentCheckIns` (`CheckIn`, own column) | |
   * | `alerts` — both the `payment` and the `class_full` kinds | |
   *
   * **The right-hand column is now empty, and Stage 3 emptied it.** Stage 2 had
   * left only the three check-in surfaces there, because `CheckIn.locationId` was
   * a scalar nothing wrote and filtering it would have returned an empty card
   * reading "nobody came to this branch". It is a real FK with a write path now, so
   * all three narrow — on the branch the member WALKED INTO, never on their home
   * branch. A drop-in is footfall at the branch whose door they used; attributing
   * their visit to the branch they signed up at would put a body in a room they
   * were not in.
   *
   * Every figure above is a single read over one population, so nothing here is
   * half branch-scoped and half gym-wide, and no card blends the two rules.
   *
   * **Stage 5 changed how the `Payment` rows in that table are reached, not where
   * they land.** All four now filter `Payment.locationId`, denormalised from the
   * order at write time, instead of joining through `order` — an index change that
   * moved no money between branches. The three `Subscription` rows keep the LIVE
   * member hop on purpose: a transferring member's recurring revenue follows them,
   * which is a product decision recorded in `common/location-filter.util.ts`.
   *
   * The response contract carries no field to flag a gym-wide figure with, so the
   * admin console annotates those cards from this table. Nothing here is zeroed or
   * emptied to make a card *look* filtered — a fabricated zero would be a worse lie
   * than an honest gym-wide number.
   *
   * **The console's Overview caption is now retired, not reworded.** It read:
   *
   *     Occupancy and check-ins are gym-wide.
   *
   * and before Stage 2, "Occupancy, check-ins, members and subscriptions are
   * gym-wide." Stage 2 struck the last two clauses; Stage 3 strikes the first two,
   * which is the whole sentence. There is nothing left on this endpoint that a
   * branch filter does not reach, so the tab carries no branch annotation at all.
   * Do not re-add one without first removing a filter above.
   */
  async getOverview(query: DashboardOverviewQuery): Promise<DashboardOverviewResponse> {
    // The header filter's period resolves to a concrete window (+ the immediately
    // preceding equal-length window for deltas); the period-bounded KPI cards read
    // it, while the live surfaces (occupancy, schedule, check-ins) stay today-bound.
    // The gym's own calendar and currency, read from its settings. Every bound
    // below is a calendar question, and answering it in the SERVER's zone made
    // "today" depend on which region the container runs in.
    const locale = await this.locales.get();
    const zone = locale.timezone;
    const win = resolvePeriodWindow(query, new Date(), zone);

    const [
      viewer,
      gymName,
      inGymNow,
      kpis,
      secondaryKpis,
      recentMembers,
      revenue,
      planMix,
      todaysSchedule,
      alerts,
      recentCheckIns,
    ] = await Promise.all([
      this.resolveViewer(),
      this.resolveGymName(),
      this.inGymNow(zone, query.locationId),
      this.kpis(win, query.locationId),
      this.secondaryKpis(win, zone, query.locationId),
      this.recentMembers(query.locationId),
      this.revenue(query.range, zone, query.locationId),
      this.planMix(query.locationId),
      this.todaysSchedule(zone, query.locationId),
      this.alerts(zone, locale.currency, query.locationId),
      this.recentCheckIns(zone, query.locationId),
    ]);
    const currency = locale.currency;

    return {
      currency,
      viewer,
      gymName,
      period: { period: win.period, from: win.fromISO, to: win.toISO },
      inGymNow,
      kpis,
      secondaryKpis,
      recentMembers,
      revenue,
      planMix,
      todaysSchedule,
      alerts,
      recentCheckIns,
    };
  }

  /* ---------------------------------------------------------------------- */
  /*  Identity / currency                                                    */
  /* ---------------------------------------------------------------------- */

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
   *
   * **`locationId` narrows the WHOLE card, not just the bars.** Stage 3 made
   * `CheckIn.locationId` a real FK with a write path, so an arrival now records the
   * door it came through. With a branch selected, `current`, `capacity` and `areas`
   * are all that one branch: the donut reads "12 of 20 here", and `areas` is the
   * selected branch alone.
   *
   * That single-element `areas` is deliberate, and it is not the same thing as an
   * unfiltered list with one non-zero row. Leaving `locations` gym-wide while
   * filtering only the check-ins would give a denominator summed over branches
   * nobody in the count can be standing in, and a column of 0/N bars for the
   * branches the operator just filtered *out* — a card that looks broken because it
   * is. Narrowing the location read too is what makes the donut mean what it says.
   *
   * Returning `[]` instead was rejected: `areas` is the only place the card names a
   * branch, so an empty list would leave the operator with a bare 12-of-20 donut and
   * nothing saying which site it counts. The one row keeps the label, and the
   * console's "…across {n} areas" caption reads correctly at n = 1.
   *
   * The location read keeps its `ACTIVE` filter under a branch selection, so a
   * DEACTIVATED branch resolves to no area and zero capacity while its arrivals
   * still count — the console's `resolveActiveLocation` degrades an id that is not
   * one of the gym's live locations to "all branches", which keeps that unreachable
   * from the switcher. Dropping the filter instead would list a closed branch here
   * and nowhere else.
   *
   * **A branchless arrival counts in `current` and lands in NO area.** `locationId`
   * is nullable and the relation is `onDelete: SetNull`, so deleting a branch un-places
   * its footfall — the migration backfilled the history and the write path stamps new
   * rows, but neither makes NULL unreachable. Such a row is a real person who was
   * really in the building, so it stays in the gym-wide `current`; it is attributed to
   * no branch, so it appears in no bar. It is emphatically NOT folded into `areas[0]`
   * (see the git history of this method): that fold-in existed only to paper over a
   * column nothing wrote, and it reported the entire gym's footfall as the oldest
   * branch's — a specific, named, innocent branch's occupancy inflated by everybody
   * else's members. Under a branch filter these rows drop out of the card entirely,
   * because equality excludes NULL, which is the correct answer twice over: they were
   * not at the selected branch, and nothing knows where they were.
   *
   * The consequence to accept: gym-wide, the bars can sum to less than `current`
   * (branchless arrivals) or to more (one member, two swipes — `current` is distinct
   * members, a bar is arrivals). The old fold-in bought exact reconciliation in the
   * first case by lying about where people were. An honest gap is the better trade.
   */
  private async inGymNow(zone: string, locationId?: string): Promise<DashboardInGymNow> {
    const db = this.prisma.client;
    const dayStart = startOfToday(zone);

    const [locations, todayCheckIns] = await Promise.all([
      db.location.findMany({
        // Not `atLocation` — that fragment narrows a model that POINTS AT a branch,
        // and this IS the branch. The selected id is this table's primary key.
        where: { status: LocationStatus.ACTIVE, ...(locationId ? { id: locationId } : {}) },
        select: { id: true, name: true },
        orderBy: { createdAt: 'asc' },
      }),
      db.checkIn.findMany({
        where: {
          gymId: this.tenant.gymId,
          checkedInAt: { gte: dayStart },
          // The branch WALKED INTO. Plain equality, served by
          // `@@index([gymId, locationId, checkedInAt])`.
          ...atLocation(locationId),
        },
        select: { gymMemberId: true, locationId: true },
      }),
    ]);

    // `Location` carries no numeric capacity column of its own, so each area's
    // headroom is derived from the real bookable capacity configured for that
    // branch's class templates (see `locationCapacities`) — a genuine per-area
    // figure, not an invented one.
    const distinctMembers = new Set(todayCheckIns.map((c) => c.gymMemberId));
    const perLocation = new Map<string, number>();
    for (const c of todayCheckIns) {
      // A NULL branch is skipped, not redistributed: the row still counts in
      // `distinctMembers` above, and belongs to no bar below. See the docblock.
      if (c.locationId) {
        perLocation.set(c.locationId, (perLocation.get(c.locationId) ?? 0) + 1);
      }
    }

    const capacities = await this.locationCapacities(locations.map((l) => l.id));
    const totalCapacity = [...capacities.values()].reduce((sum, c) => sum + c, 0);

    const areas: DashboardArea[] = locations.map((loc) => ({
      name: loc.name,
      capacity: capacities.get(loc.id) ?? 0,
      occupancy: perLocation.get(loc.id) ?? 0,
    }));

    return { current: distinctMembers.size, capacity: totalCapacity, areas };
  }

  /**
   * Per-location capacity, derived from the maximum class capacity configured for
   * each location's active class templates — the real bookable headroom the gym
   * set for that branch. A location with no templates contributes 0 (an honest
   * "no configured capacity" rather than a fabricated number).
   *
   * It takes the ids its caller resolved rather than a branch of its own, which is
   * what makes the filtered card add up: with one branch selected {@link inGymNow}
   * hands it that one id, so the donut's denominator is that branch's headroom and
   * not the gym's. `ClassTemplate` owns a real `locationId`, so this is a plain
   * `IN` over one column — no member hop, no relation filter.
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
   * The three headline KPIs over the selected period {@link win}, each with a real
   * delta vs. the immediately preceding equal-length window:
   *   • todaysRevenue — SUM captured `Payment.amount` in the window.
   *   • checkInsToday — COUNT check-ins in the window.
   *   • newMembers7d  — COUNT `MEMBER` joined in the window.
   * (The field names keep their original spelling for wire-compatibility; the
   * client labels them by the resolved period.)
   *
   * `locationId` narrows all three pairs, each on its own rule. The revenue pair
   * filters `Payment.locationId` — the till the money went into, which Stage 5
   * denormalised from the order so this is an index-served equality rather than
   * the relation filter it was. The new-member pair filters
   * `GymMember.locationId` directly, the home branch Stage 2 added, so "new members
   * this week" is genuinely this branch's joiners. The check-in pair filters
   * `CheckIn.locationId`, the branch WALKED INTO, which Stage 3 turned from a
   * dangling scalar into a real FK with a write path — a drop-in counts as footfall
   * where they swiped, not where they signed up.
   *
   * That makes `checkInsToday` and `newMembers7d` deliberately different rules on
   * one row of cards, and the pairing is the point rather than an inconsistency:
   * one card counts visits to a place, the other counts people who belong to it.
   * Both partition the gym, so each still sums across branches to its gym-wide
   * figure. Note also that both terms of every pair take the SAME filter, so a delta
   * is always this branch now against this branch then.
   */
  private async kpis(win: PeriodWindow, locationId?: string): Promise<DashboardKpis> {
    const db = this.prisma.client;
    const gymId = this.tenant.gymId;
    const atBranch = atLocation(locationId);

    const [revenueNow, revenuePrev, checkInsNow, checkInsPrev, newMembersNow, newMembersPrev] =
      await Promise.all([
        db.payment.aggregate({
          where: {
            status: PaymentStatus.CAPTURED,
            createdAt: { gte: win.start, lt: win.end },
            ...atBranch,
          },
          _sum: { amount: true },
        }),
        db.payment.aggregate({
          where: {
            status: PaymentStatus.CAPTURED,
            createdAt: { gte: win.prevStart, lt: win.prevEnd },
            ...atBranch,
          },
          _sum: { amount: true },
        }),
        // Branch-filtered on the branch the member WALKED INTO — the column
        // Stage 3 made real, served by `@@index([gymId, locationId, checkedInAt])`.
        db.checkIn.count({
          where: { gymId, checkedInAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
        }),
        db.checkIn.count({
          where: {
            gymId,
            checkedInAt: { gte: win.prevStart, lt: win.prevEnd },
            ...atLocation(locationId),
          },
        }),
        // Branch-filtered on the member's HOME branch — a joiner belongs to the
        // branch they signed up to, which is the column Stage 2 added and which
        // `@@index([gymId, locationId, status])` serves.
        db.gymMember.count({
          where: {
            role: Role.MEMBER,
            joinedAt: { gte: win.start, lt: win.end },
            ...atLocation(locationId),
          },
        }),
        db.gymMember.count({
          where: {
            role: Role.MEMBER,
            joinedAt: { gte: win.prevStart, lt: win.prevEnd },
            ...atLocation(locationId),
          },
        }),
      ]);

    const revNow = revenueNow._sum.amount ?? 0;
    const revPrev = revenuePrev._sum.amount ?? 0;

    const todaysRevenue: DashboardKpi = {
      value: revNow,
      deltaPct: pctDelta(revNow, revPrev),
    };
    const checkIns: DashboardKpi = {
      value: checkInsNow,
      deltaPct: pctDelta(checkInsNow, checkInsPrev),
    };
    const newMembers: DashboardKpi = {
      value: newMembersNow,
      deltaPct: pctDelta(newMembersNow, newMembersPrev),
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
   *   • classesToday     — COUNT class occurrences within the selected period {@link win}.
   *   • expiringSoon     — COUNT live subscriptions ending within 7 days.
   *   • renewalsDue      — COUNT live subscriptions ending within this calendar month.
   *
   * Only `classesToday` follows the header period; the others are current-state /
   * forward-looking figures that are meaningless to re-window into the past, so they
   * stay pinned to "now" / "this month" regardless of the selected window.
   *
   * `locationId` narrows ALL SIX. `revenueThisMonth` goes through the payment's
   * order and `classesToday` filters `ClassInstance.locationId` directly, as
   * before. Stage 2 added the other four: `activeMembers` reads
   * `GymMember.locationId`, and `overduePayments` / `expiringSoon` / `renewalsDue`
   * hop through `Subscription.member` to the same home branch. Each is a single
   * count over one population, so the six reconcile with each other and, summed
   * across branches, with the gym.
   */
  private async secondaryKpis(
    win: PeriodWindow,
    zone: string,
    locationId?: string,
  ): Promise<DashboardSecondaryKpis> {
    const db = this.prisma.client;
    const now = new Date();
    const monthStart = startOfMonth(now, zone);
    // One millisecond before this month began is inside the previous month, in
    // whatever zone — safer than month-1 arithmetic across a year boundary.
    const lastMonthStart = startOfMonth(new Date(monthStart.getTime() - 1), zone);
    // 32 days past this month's start is always inside the next month.
    const nextMonthStart = startOfMonth(new Date(monthStart.getTime() + 32 * DAY_MS), zone);
    const in7Days = new Date(now.getTime() + 7 * DAY_MS);
    const live = [...LIVE_SUBSCRIPTION_STATUSES];
    const atBranch = atLocation(locationId);

    const [
      activeMembers,
      revenueThisMonthAgg,
      revenueLastMonthAgg,
      overduePayments,
      classesToday,
      expiringSoon,
      renewalsDue,
    ] = await Promise.all([
      // The member's HOME branch — `@@index([gymId, locationId, status])` is
      // exactly this count's shape.
      db.gymMember.count({
        where: {
          role: Role.MEMBER,
          status: GymMemberStatus.ACTIVE,
          ...atLocation(locationId),
        },
      }),
      db.payment.aggregate({
        where: { status: PaymentStatus.CAPTURED, createdAt: { gte: monthStart }, ...atBranch },
        _sum: { amount: true },
      }),
      db.payment.aggregate({
        where: {
          status: PaymentStatus.CAPTURED,
          createdAt: { gte: lastMonthStart, lt: monthStart },
          ...atBranch,
        },
        _sum: { amount: true },
      }),
      // A `Subscription` reaches a branch through its member, and since Stage 2
      // that member has one. Attributed to the member's home branch — the same
      // rule the Revenue tab's MRR and the Members tab's cohorts use, so the
      // dunning backlog on this card is about the same people. (Same for the two
      // renewal counts below.)
      db.subscription.count({
        where: { status: SubscriptionStatus.PAST_DUE, ...memberAtLocation(locationId) },
      }),
      db.classInstance.count({
        where: { startsAt: { gte: win.start, lt: win.end }, ...atLocation(locationId) },
      }),
      db.subscription.count({
        where: {
          status: { in: live },
          currentPeriodEnd: { gte: now, lte: in7Days },
          ...memberAtLocation(locationId),
        },
      }),
      db.subscription.count({
        where: {
          status: { in: live },
          currentPeriodEnd: { gte: monthStart, lt: nextMonthStart },
          ...memberAtLocation(locationId),
        },
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
   *
   * `locationId` narrows it to one branch's takings, on `Payment.locationId`.
   * Stage 5 removed the index caveat this comment used to carry: the order
   * relation filter took the read off its `(gymId, createdAt)` plan, and the
   * denormalised column restores an index-served range scan via
   * `(gymId, locationId, createdAt)`.
   */
  private async revenue(
    range: DashboardRange,
    zone: string,
    locationId?: string,
  ): Promise<DashboardRevenue> {
    const win = resolveWindow(range, zone);
    const rows = await this.prisma.client.payment.findMany({
      where: {
        status: PaymentStatus.CAPTURED,
        createdAt: { gte: win.start, lt: win.end },
        ...atLocation(locationId),
      },
      select: { amount: true, createdAt: true },
    });

    const buckets = emptyBuckets(win, zone);
    let total = 0;
    for (const row of rows) {
      const key = bucketKey(row.createdAt, win.bucket, zone);
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
   *
   * `locationId` narrows it to the plans held by the members homed at that branch.
   * A `Subscription` reaches a branch only through its `GymMember`, and since
   * Stage 2 that member has one — the same hop the roster's own plan-mix card uses
   * (`members.service.ts`), so the two cannot disagree about what this branch sells.
   */
  private async planMix(locationId?: string): Promise<DashboardPlanMix> {
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
        ...memberAtLocation(locationId),
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
   *
   * `locationId` narrows it to the branch's own timetable — plain equality on
   * `ClassInstance.locationId`, served by `(gymId, locationId, startsAt)`.
   */
  private async todaysSchedule(zone: string, locationId?: string): Promise<DashboardScheduleRow[]> {
    const dayStart = startOfToday(zone);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);

    const instances = await this.prisma.client.classInstance.findMany({
      where: { startsAt: { gte: dayStart, lt: dayEnd }, ...atLocation(locationId) },
      orderBy: { startsAt: 'asc' },
      select: {
        startsAt: true,
        capacityOverride: true,
        trainer: { select: { name: true } },
        template: {
          select: { title: true, capacity: true, color: true, trainer: { select: { name: true } } },
        },
        classType: { select: { name: true, capacity: true, color: true } },
        bookings: {
          where: { status: { in: [BookingStatus.BOOKED, BookingStatus.ATTENDED] } },
          select: { id: true },
        },
      },
    });

    return instances.map((inst) => ({
      startsAt: inst.startsAt.toISOString(),
      title: inst.template?.title ?? inst.classType?.name ?? 'Class',
      trainerName: inst.trainer?.name ?? inst.template?.trainer?.name ?? null,
      booked: inst.bookings.length,
      capacity: inst.capacityOverride ?? inst.template?.capacity ?? inst.classType?.capacity ?? 0,
      color: inst.template?.color ?? inst.classType?.color ?? null,
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
   *
   * All three kinds are branch-filterable, so with a `locationId` the feed is
   * genuinely that branch's events: the two payment reads filter `Payment.locationId`
   * and the class read filters `ClassInstance.locationId`, both directly.
   */
  private async alerts(
    zone: string,
    currency: string,
    locationId?: string,
  ): Promise<DashboardAlert[]> {
    const db = this.prisma.client;
    const dayStart = startOfToday(zone);
    const dayEnd = new Date(dayStart.getTime() + DAY_MS);
    const atBranch = atLocation(locationId);

    const [recentPayment, failedPayments, todayInstances] = await Promise.all([
      db.payment.findFirst({
        where: { status: PaymentStatus.CAPTURED, ...atBranch },
        orderBy: { createdAt: 'desc' },
        select: { amount: true, currency: true, createdAt: true },
      }),
      db.payment.findMany({
        where: {
          status: PaymentStatus.FAILED,
          createdAt: { gte: dayStart, lt: dayEnd },
          ...atBranch,
        },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
        take: 3,
      }),
      db.classInstance.findMany({
        where: { startsAt: { gte: dayStart, lt: dayEnd }, ...atLocation(locationId) },
        select: {
          startsAt: true,
          capacityOverride: true,
          template: { select: { title: true, capacity: true } },
          classType: { select: { name: true, capacity: true } },
          bookings: {
            where: { status: { in: [BookingStatus.BOOKED, BookingStatus.ATTENDED] } },
            select: { id: true },
          },
        },
      }),
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
      const capacity =
        inst.capacityOverride ?? inst.template?.capacity ?? inst.classType?.capacity ?? 0;
      if (capacity <= 0) {
        continue;
      }
      const pct = Math.round((inst.bookings.length / capacity) * 100);
      if (pct >= 90) {
        alerts.push({
          kind: 'class_full',
          title: `${inst.template?.title ?? inst.classType?.name ?? 'Class'} is ${pct}% full`,
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
   *
   * **`locationId` narrows it to arrivals AT that branch** — `CheckIn.locationId`,
   * the door they came through, not `member.locationId`, the branch they call home.
   * The feed sits under the occupancy card and is the named-people version of the
   * same event, so it has to read the same column {@link inGymNow} counts or the
   * card and the list underneath it would disagree about who is in the building.
   *
   * The take-6 is applied AFTER the filter, so a branch's feed is that branch's six
   * most recent arrivals rather than whatever survives filtering the gym's six.
   * A branchless arrival (`SetNull` after a branch is deleted) drops out under a
   * filter and stays in the gym-wide feed — see {@link inGymNow}.
   */
  private async recentCheckIns(zone: string, locationId?: string): Promise<DashboardCheckIn[]> {
    const rows = await this.prisma.client.checkIn.findMany({
      where: {
        gymId: this.tenant.gymId,
        checkedInAt: { gte: startOfToday(zone) },
        ...atLocation(locationId),
      },
      orderBy: { checkedInAt: 'desc' },
      take: 6,
      select: {
        method: true,
        checkedInAt: true,
        member: {
          select: {
            id: true,
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
      memberId: row.member.id,
      name: row.member.user.name ?? row.member.user.email,
      planName: row.member.subscriptions[0]?.plan?.name ?? null,
      method: row.method,
      checkedInAt: row.checkedInAt.toISOString(),
    }));
  }

  /**
   * The latest joiners for the "recent members" table — top 6 `MEMBER`-role members
   * by `joinedAt`, each with their current live subscription's plan name + period end
   * (the "expiry"). All real, tenant-scoped via the Prisma extension.
   *
   * `locationId` narrows it to the branch's own joiners — plain equality on
   * `GymMember.locationId`, the home branch Stage 2 added. It reads the same
   * population `kpis.newMembers7d` counts, so the card and the table above it
   * cannot disagree about who is new here.
   */
  private async recentMembers(locationId?: string): Promise<DashboardRecentMember[]> {
    const rows = await this.prisma.client.gymMember.findMany({
      where: { role: Role.MEMBER, ...atLocation(locationId) },
      orderBy: { joinedAt: 'desc' },
      take: 6,
      select: {
        id: true,
        status: true,
        joinedAt: true,
        user: { select: { name: true, email: true } },
        subscriptions: {
          where: { status: { in: [...LIVE_SUBSCRIPTION_STATUSES] } },
          orderBy: { currentPeriodEnd: 'desc' },
          take: 1,
          select: { currentPeriodEnd: true, plan: { select: { name: true } } },
        },
      },
    });

    return rows.map((m) => ({
      id: m.id,
      name: m.user.name ?? m.user.email,
      email: m.user.email,
      planName: m.subscriptions[0]?.plan?.name ?? null,
      status: m.status,
      joinedAt: m.joinedAt.toISOString(),
      expiresAt: m.subscriptions[0]?.currentPeriodEnd?.toISOString() ?? null,
    }));
  }
}

/* -------------------------------------------------------------------------- */
/*  Constants                                                                  */
/* -------------------------------------------------------------------------- */

/** Fixed accent palette for the plan-mix stacked bar, brand-first. */
const PLAN_COLORS = ['#7C3AED', '#EC4899', '#2563EB', '#0EA5E9', '#10B981', '#F59E0B'];

/*
 * `resolveWindow` / `bucketKey` / `emptyBuckets` used to be duplicated HERE, in
 * UTC, alongside the identical pair in `report-window.util.ts`. Two copies of
 * bucket arithmetic is one copy too many — they had already drifted in what they
 * accepted — and the shared pair is now timezone-aware, which this needed
 * anyway. `WindowSpec` stays because this surface's range vocabulary is the
 * narrower `7d|30d|12w`.
 */

/** Start of the gym's current calendar day — the "today" bound. */
function startOfToday(zone: string): Date {
  return startOfLocalDay(new Date(), zone);
}

/** Start of the gym's current calendar month. */
function startOfMonth(d: Date, zone: string): Date {
  const { year, month } = zonedParts(d, zone);
  return zonedDayStart(`${year}-${String(month).padStart(2, '0')}-01`, zone);
}

/* -------------------------------------------------------------------------- */
/*  Period window (the header date filter)                                     */
/* -------------------------------------------------------------------------- */

/**
 * A resolved period filter: the concrete `[start, end)` window the KPI cards
 * aggregate over, the immediately preceding equal-length `[prevStart, prevEnd)`
 * window their deltas compare against, and the inclusive `YYYY-MM-DD` calendar
 * bounds (`fromISO`/`toISO`) echoed to the client for labels + the date picker.
 * All bounds are in the server's local zone, matching {@link startOfToday}.
 */
export interface PeriodWindow {
  period: DashboardPeriod;
  /** Inclusive lower bound (local midnight). */
  start: Date;
  /** Exclusive upper bound. */
  end: Date;
  /** Previous equal-length window, inclusive lower bound. */
  prevStart: Date;
  /** Previous equal-length window, exclusive upper bound (equals {@link start}). */
  prevEnd: Date;
  /** First included day, `YYYY-MM-DD` (local). */
  fromISO: string;
  /** Last included day, `YYYY-MM-DD` (local). */
  toISO: string;
}

/**
 * Midnight starting the given instant's calendar day, IN THE GYM'S ZONE.
 *
 * These four helpers used to read the SERVER's zone (`d.getFullYear()` and
 * friends), which is the one answer that is wrong everywhere: it makes "today's
 * revenue" depend on which region the container happens to run in, and silently
 * changes the numbers if that ever moves. The gym's own zone is in its settings.
 */
function startOfLocalDay(d: Date, zone: string): Date {
  return zonedDayStart(zonedIsoDate(d, zone), zone);
}

/** The date `n` calendar days after `d`'s local midnight (n may be negative). */
function addDays(d: Date, n: number, zone: string): Date {
  return zonedDayStart(addZonedDays(zonedIsoDate(d, zone), n, zone), zone);
}

/** The gym-local Monday starting the ISO week that contains `d`. */
function startOfWeekMonday(d: Date, zone: string): Date {
  // `weekday` is already 0 = Monday, so it IS the offset back to Monday.
  return addDays(d, -zonedParts(d, zone).weekday, zone);
}

/** Parse a `YYYY-MM-DD` calendar date as local midnight (invalid → today). */
function parseLocalDate(iso: string, fallback: Date, zone: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    return startOfLocalDay(fallback, zone);
  }
  return zonedDayStart(iso, zone);
}

/** Format a local-zone date as its `YYYY-MM-DD` calendar day. */
function localIsoDate(d: Date, zone: string): string {
  return zonedIsoDate(d, zone);
}

/**
 * Resolve a dashboard query's period (+ optional custom `from`/`to`) into a
 * concrete {@link PeriodWindow} relative to `now`. `today`/`week`/`month` snap to
 * the server's calendar; `custom` reads the `YYYY-MM-DD` bounds (defaulting a
 * missing side to today and swapping a reversed range so the window is always
 * valid). Pure and deterministic given (`query`, `now`) — unit-tested directly.
 */
export function resolvePeriodWindow(
  query: { period?: DashboardPeriod; from?: string; to?: string },
  now: Date,
  zone = 'UTC',
): PeriodWindow {
  const period = query.period ?? DEFAULT_DASHBOARD_PERIOD;
  let start: Date;
  let end: Date;

  switch (period) {
    case 'today':
      start = startOfLocalDay(now, zone);
      end = addDays(start, 1, zone);
      break;
    case 'week':
      start = startOfWeekMonday(now, zone);
      end = addDays(start, 7, zone);
      break;
    case 'month': {
      const { year, month } = zonedParts(now, zone);
      const first = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}-01`;
      start = zonedDayStart(first(year, month), zone);
      end = zonedDayStart(month === 12 ? first(year + 1, 1) : first(year, month + 1), zone);
      break;
    }
    case 'custom': {
      // Each side defaults independently to today, so a one-sided custom range
      // (only `from` or only `to`) reads as "from that day through today".
      const a = query.from ? parseLocalDate(query.from, now, zone) : startOfLocalDay(now, zone);
      const b = query.to ? parseLocalDate(query.to, now, zone) : startOfLocalDay(now, zone);
      const lo = a <= b ? a : b;
      const hi = a <= b ? b : a;
      start = startOfLocalDay(lo, zone);
      end = addDays(startOfLocalDay(hi, zone), 1, zone);
      break;
    }
  }

  const durationMs = end.getTime() - start.getTime();
  return {
    period,
    start,
    end,
    prevStart: new Date(start.getTime() - durationMs),
    prevEnd: start,
    fromISO: localIsoDate(start, zone),
    toISO: localIsoDate(addDays(end, -1, zone), zone),
  };
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
