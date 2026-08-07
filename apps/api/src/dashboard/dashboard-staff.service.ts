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
 * **The tab has two halves that this service cannot join.** `Trainer` carries the
 * availability that utilization divides by; `ShiftSlot` hangs off a staff
 * `GymMember`. The schema has no foreign key between them, so no figure here
 * crosses that line and no total spans both.
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
  constructor(private readonly prisma: TenantPrismaService) {}

  /** Build the whole Staff tab for one granularity. */
  async get(query: DashboardStaffQuery): Promise<DashboardStaffResponse> {
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity]);

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

    const classBuckets = emptyBuckets(win);
    const ptBuckets = emptyBuckets(win);
    const perTrainer = new Map<string, TrainerAgg>();
    let classesWithoutTrainer = 0;

    for (const occurrence of instances) {
      const key = bucketKey(occurrence.startsAt, win.bucket);
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
      const key = bucketKey(pt.startsAt, win.bucket);
      if (ptBuckets.has(key)) {
        ptBuckets.set(key, (ptBuckets.get(key) ?? 0) + 1);
      }
      const agg = trainerAgg(perTrainer, pt.trainerId);
      agg.pt += 1;
      agg.minutes += durationMinutes(pt);
    }

    /* -- Utilization -------------------------------------------------------- */

    const counts = weekdayCounts(win);
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
      const from = Math.max(startOfUtcDay(request.startDate), startOfUtcDay(win.start));
      const to = Math.min(startOfUtcDay(request.endDate), startOfUtcDay(win.end));
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

/** The UTC midnight of an instant's own calendar day, as epoch ms. */
function startOfUtcDay(at: Date): number {
  return Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate());
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
function weekdayCounts(win: ReportWindow): number[] {
  const counts = new Array<number>(7).fill(0);
  let cursor = new Date(`${isoDate(win.start)}T00:00:00.000Z`).getTime();
  while (cursor < win.end.getTime()) {
    const index = (new Date(cursor).getUTCDay() + 6) % 7;
    counts[index] = (counts[index] ?? 0) + 1;
    cursor += DAY_MS;
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
