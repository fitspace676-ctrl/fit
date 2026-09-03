import { Injectable } from '@nestjs/common';
import { InstanceStatus, Role, TimeOffStatus, TrainerStatus } from '@fit/db';
import {
  SALES_GRANULARITY_RANGE,
  TOP_TRAINERS,
  weeklyAvailabilitySchema,
  type DashboardStaffQuery,
  type DashboardStaffResponse,
  type ShiftCoverageDay,
  type TrainerDelivery,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { addZonedDays, zonedDayStart, zonedParts } from '../reports/zoned-time.util';
import {
  bucketKey,
  DAY_MS,
  emptyBuckets,
  isoDate,
  rate,
  resolveWindow,
  type ReportWindow,
} from '../reports/report-window.util';

/**
 * Weekday keys in `ShiftSlot.dayOfWeek` order: 0 = Monday … 6 = Sunday. The same
 * order the client's weekday labels are listed in.
 */
const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

/** One trainer's running totals. */
interface TrainerAgg {
  classes: number;
  pt: number;
  minutes: number;
}

/**
 * Read side of the hand-built Staff dashboard tab.
 *
 * Produces the whole tab in one round trip: four KPIs, the delivery trend split
 * classes against PT, per-trainer delivery and utilization, the standing weekly
 * rota, and the gaps card.
 *
 * **The tab has two halves and no figure here spans both.** `Trainer` carries the
 * availability that utilization divides by; `ShiftSlot` hangs off a staff
 * `GymMember`. They are joinable now - `Trainer.staffId` and `ShiftSlot.staffId`
 * both point at `GymMember`, and a coach's availability is mirrored onto their
 * shift rows (`trainer-shift-mirror.ts`) - but a coach is not the only kind of
 * staff, so a total spanning both would be adding a coach's hours to a
 * receptionist's and calling the sum coverage. The split is kept on purpose.
 *
 * **Nothing here claims a staff member worked.** `ShiftSlot` is the standing plan
 * and `TimeOffRequest` the approved absence; attendance is not recorded anywhere.
 * The coverage figures are scheduled hours, and the wire names them so.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`.
 */
@Injectable()
export class DashboardStaffService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly locales: GymLocaleService,
  ) {}

  /** Build the whole Staff tab for one granularity. */
  async get(query: DashboardStaffQuery): Promise<DashboardStaffResponse> {
    // The gym's own calendar. Fetched BEFORE the aggregates because the window
    // itself is a calendar question: `resolveWindow` has to know where midnight
    // is before it can say which days the chart covers.
    const locale = await this.locales.get();
    const zone = locale.timezone;
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity], zone);

    const [instances, ptSessions, trainers, shiftSlots, timeOff, staffCount] = await Promise.all([
      this.prisma.client.classInstance.findMany({
        where: {
          startsAt: { gte: win.start, lt: win.end },
          status: { not: InstanceStatus.CANCELED },
        },
        select: { trainerId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.client.ptSession.findMany({
        where: {
          startsAt: { gte: win.start, lt: win.end },
          status: { not: InstanceStatus.CANCELED },
        },
        select: { trainerId: true, startsAt: true, endsAt: true },
      }),
      this.prisma.client.trainer.findMany({
        where: { status: TrainerStatus.ACTIVE },
        select: { id: true, name: true, availability: true },
      }),
      // NOT window-scoped: a recurring weekly rota carries no dates.
      this.prisma.client.shiftSlot.findMany({
        select: { staffId: true, dayOfWeek: true, startTime: true, endTime: true },
      }),
      this.prisma.client.timeOffRequest.findMany({
        where: {
          status: TimeOffStatus.approved,
          startDate: { lt: win.end },
          endDate: { gte: win.start },
        },
        select: { startDate: true, endDate: true },
      }),
      this.prisma.client.gymMember.count({
        where: { role: { not: Role.MEMBER }, deletedAt: null },
      }),
    ]);

    /* -- Delivery ---------------------------------------------------------- */

    const classBuckets = emptyBuckets(win, zone);
    const ptBuckets = emptyBuckets(win, zone);
    const perTrainer = new Map<string, TrainerAgg>();
    let classesWithoutTrainer = 0;

    for (const occurrence of instances) {
      const key = bucketKey(occurrence.startsAt, win.bucket, zone);
      if (occurrence.trainerId === null) {
        // Somebody taught it and this service does not know who. Counted in the
        // gaps rather than guessed into a trainer's total.
        classesWithoutTrainer += 1;
        continue;
      }
      if (classBuckets.has(key)) {
        classBuckets.set(key, (classBuckets.get(key) ?? 0) + 1);
      }
      const agg = trainerAgg(perTrainer, occurrence.trainerId);
      agg.classes += 1;
      agg.minutes += durationMinutes(occurrence);
    }

    for (const pt of ptSessions) {
      const key = bucketKey(pt.startsAt, win.bucket, zone);
      if (ptBuckets.has(key)) {
        ptBuckets.set(key, (ptBuckets.get(key) ?? 0) + 1);
      }
      const agg = trainerAgg(perTrainer, pt.trainerId);
      agg.pt += 1;
      agg.minutes += durationMinutes(pt);
    }

    /* -- Utilization -------------------------------------------------------- */

    const counts = weekdayCounts(win, zone);
    let ratedDelivered = 0;
    let ratedAvailable = 0;
    let trainersWithoutAvailability = 0;

    const rows: TrainerDelivery[] = trainers.map((row) => {
      const agg = perTrainer.get(row.id) ?? { classes: 0, pt: 0, minutes: 0 };
      const available = availableMinutes(row.availability, counts);
      if (available === null) {
        trainersWithoutAvailability += 1;
      } else {
        ratedDelivered += agg.minutes;
        ratedAvailable += available;
      }
      return {
        name: row.name,
        classes: agg.classes,
        pt: agg.pt,
        sessions: agg.classes + agg.pt,
        hours: toHours(agg.minutes),
        utilizationRate: available === null ? null : rate(agg.minutes, available),
      };
    });

    /* -- The rota ----------------------------------------------------------- */

    const coverage = DAY_KEYS.map((_, dayOfWeek) => ({
      dayOfWeek,
      minutes: 0,
      staff: new Set<string>(),
    }));
    const scheduledStaff = new Set<string>();
    let invalidShiftSlots = 0;

    for (const slot of shiftSlots) {
      const minutes = toMinutes(slot.endTime) - toMinutes(slot.startTime);
      const day = coverage[slot.dayOfWeek];
      if (day === undefined || minutes <= 0) {
        // An overnight shift, or a typo. Counted, not wrapped into a negative day.
        invalidShiftSlots += 1;
        continue;
      }
      day.minutes += minutes;
      day.staff.add(slot.staffId);
      scheduledStaff.add(slot.staffId);
    }

    /* -- Leave -------------------------------------------------------------- */

    let leaveStaffDays = 0;
    for (const request of timeOff) {
      const from = Math.max(startOfDay(request.startDate, zone), startOfDay(win.start, zone));
      const to = Math.min(startOfDay(request.endDate, zone), startOfDay(win.end, zone));
      // Inclusive of both ends: a one-day request is one staff-day, not zero.
      if (to >= from) leaveStaffDays += Math.round((to - from) / DAY_MS) + 1;
    }

    const scheduledMinutes = coverage.reduce((sum, day) => sum + day.minutes, 0);

    return {
      granularity: query.granularity,
      kpis: {
        trainersDelivering: [...perTrainer.values()].filter((agg) => agg.classes + agg.pt > 0)
          .length,
        sessionsDelivered: instances.length - classesWithoutTrainer + ptSessions.length,
        // Weighted by hours, not averaged across rates: one trainer with two
        // available hours must not swing this like one with forty.
        utilizationRate: ratedAvailable === 0 ? null : rate(ratedDelivered, ratedAvailable),
        scheduledHoursPerWeek: toHours(scheduledMinutes),
      },
      sessionsOverTime: [...classBuckets.entries()].map(([label, classes]) => ({
        label,
        classes,
        pt: ptBuckets.get(label) ?? 0,
      })),
      trainers: rows.sort((a, b) => b.sessions - a.sessions).slice(0, TOP_TRAINERS),
      shiftCoverage: coverage.map(
        (day): ShiftCoverageDay => ({
          dayOfWeek: day.dayOfWeek,
          hours: toHours(day.minutes),
          staffCount: day.staff.size,
        }),
      ),
      gaps: {
        leaveStaffDays,
        staffWithoutShifts: Math.max(0, staffCount - scheduledStaff.size),
        trainersWithoutAvailability,
        classesWithoutTrainer,
        invalidShiftSlots,
      },
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/** `"HH:MM"` as minutes past midnight. */
function toMinutes(time: string): number {
  const [hours, minutes] = time.split(':');
  return Number(hours) * 60 + Number(minutes);
}

/** Minutes as decimal hours, one place. */
function toHours(minutes: number): number {
  return Math.round((minutes / 60) * 10) / 10;
}

/**
 * The instant an instant's own calendar day begins in `zone`, as epoch ms.
 *
 * Clamping a leave request against the window has to compare like with like: if
 * the window's edges are the gym's days, the request's edges must be too, or a
 * request that ends on the window's last local day gets clipped a day short.
 */
function startOfDay(at: Date, zone: string): number {
  return zonedDayStart(isoDate(at, zone), zone).getTime();
}

/** One occurrence's length in minutes. */
function durationMinutes(occurrence: { startsAt: Date; endsAt: Date }): number {
  return Math.max(0, (occurrence.endsAt.getTime() - occurrence.startsAt.getTime()) / 60000);
}

/** The running totals for one trainer, created on first use. */
function trainerAgg(perTrainer: Map<string, TrainerAgg>, id: string): TrainerAgg {
  let agg = perTrainer.get(id);
  if (!agg) {
    agg = { classes: 0, pt: 0, minutes: 0 };
    perTrainer.set(id, agg);
  }
  return agg;
}

/**
 * How many times each weekday falls inside the window, Monday first. A weekly
 * availability means nothing until it is multiplied by this.
 */
function weekdayCounts(win: ReportWindow, zone: string): number[] {
  const counts = new Array<number>(7).fill(0);
  // Walks the GYM'S calendar days, so "how many Mondays are in this window"
  // counts the gym's Mondays. It also steps the calendar rather than adding 24h,
  // which in a daylight-saving zone would eventually skip or double-count a day.
  let cursor = isoDate(win.start, zone);
  while (zonedDayStart(cursor, zone) < win.end) {
    const index = zonedParts(zonedDayStart(cursor, zone), zone).weekday;
    counts[index] = (counts[index] ?? 0) + 1;
    cursor = addZonedDays(cursor, 1, zone);
  }
  return counts;
}

/**
 * A trainer's bookable minutes over the window, or `null` when there are none to
 * divide by.
 *
 * `safeParse`, not `parse`: the column is `Json` and predates the validator, so a
 * malformed value is data to report rather than an exception to throw. An unset
 * week (`{}`, the stored default for a new trainer) parses fine and sums to zero —
 * the same `null`, and the same line in the gaps card. Reporting either as 0%
 * utilization would call an unconfigured trainer idle.
 */
function availableMinutes(raw: unknown, counts: number[]): number | null {
  const parsed = weeklyAvailabilitySchema.safeParse(raw ?? {});
  if (!parsed.success) return null;
  let total = 0;
  DAY_KEYS.forEach((key, index) => {
    const day = parsed.data[key];
    if (!day.available) return;
    const minutes = day.windows.reduce(
      (sum, window) => sum + (toMinutes(window.end) - toMinutes(window.start)),
      0,
    );
    total += minutes * (counts[index] ?? 0);
  });
  return total === 0 ? null : total;
}
