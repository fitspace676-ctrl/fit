import { Injectable } from '@nestjs/common';
import { BookingStatus, InstanceStatus } from '@fit/db';
import {
  HEATMAP_COLS,
  HEATMAP_ROWS,
  TOP_CLASS_TYPES,
  SALES_GRANULARITY_RANGE,
  type ClassTypeSlice,
  type DashboardClassesQuery,
  type DashboardClassesResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { GymLocaleService } from '../gyms/gym-locale.service';
import { bucketKey, emptyBuckets, rate, resolveWindow } from '../reports/report-window.util';
import { zonedParts } from '../reports/zoned-time.util';
import { atLocation } from '../common/location-filter.util';

/** How many class types the ranking shows. The card's caption states it. */

/** Fallback name for an occurrence whose template and type are both gone. */
const UNNAMED_CLASS = 'Class';

/** The booking states that HELD a seat. A waitlist entry did not. */
const SEAT_HOLDING: readonly BookingStatus[] = [
  BookingStatus.BOOKED,
  BookingStatus.ATTENDED,
  BookingStatus.NO_SHOW,
];

/** Running totals for one class type. */
interface TypeAgg {
  seatsBooked: number;
  sessions: number;
  capacity: number;
}

/**
 * Read side of the hand-built Classes dashboard tab.
 *
 * Produces the whole tab in one round trip: four KPIs, four trends, the ranked
 * class-type list and the weekday x hour demand heatmap.
 *
 * Three rules decide every figure here:
 *
 * **A seat is a `Booking` row, everywhere.** `ClassInstance.bookedCount` is a
 * maintained denormalisation and the drill-down's fill rate reads it, but this tab
 * already holds the rows — and an owner comparing the utilization card against the
 * bookings chart beside it must never find two numbers.
 *
 * **A rate with no denominator is `null`, not `0`.** 0% attendance is the claim
 * "nobody who booked turned up"; a week with nothing marked has made no claim at
 * all. `markedCoverage` reports how much of the window was ever marked, so the
 * attendance rate can be read with the confidence it has earned.
 *
 * **A cancelled occurrence is not an empty room.** It released its trainer and its
 * room, so it leaves utilization and `classesHeld` entirely.
 *
 * Scoped by {@link TenantPrismaService}'s extension, so no query passes or trusts
 * a `gymId`.
 *
 * **`locationId` narrows the class half of the tab exactly, and leaves the PT
 * series alone.** `ClassInstance` owns a `locationId` (backfilled in Stage 0,
 * indexed as `(gymId, locationId, startsAt)`) and a `Booking` is reached through
 * its occurrence, so every KPI, trend, ranking and heatmap cell that counts
 * classes or seats is genuinely that branch's.
 *
 * `ptSessionsOverTime` is the exception: `PtSession` has no location column, so it
 * stays gym-wide until Stage 6. It is a standalone series — nothing on this tab
 * sums PT together with a class figure — so no single number here ends up half
 * branch and half gym. The caption this docblock was written against, which the
 * console mirrors verbatim:
 *
 *     PT sessions are gym-wide.
 */
@Injectable()
export class DashboardClassesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly locales: GymLocaleService,
  ) {}

  /** Build the whole Classes tab for one granularity. */
  async get(query: DashboardClassesQuery): Promise<DashboardClassesResponse> {
    // The gym's own calendar. Fetched BEFORE the aggregates because the window
    // itself is a calendar question: `resolveWindow` has to know where midnight
    // is before it can say which days the chart covers.
    const locale = await this.locales.get();
    const zone = locale.timezone;
    const win = resolveWindow(SALES_GRANULARITY_RANGE[query.granularity], zone);
    const now = new Date();
    const atBranch = atLocation(query.locationId);

    const [instances, bookings, ptSessions] = await Promise.all([
      this.prisma.client.classInstance.findMany({
        where: { startsAt: { gte: win.start, lt: win.end }, ...atBranch },
        select: {
          startsAt: true,
          status: true,
          capacityOverride: true,
          template: { select: { title: true, capacity: true } },
          classType: { select: { name: true, capacity: true } },
        },
      }),
      // A `Booking` carries no branch of its own; it inherits the occurrence's.
      // The branch clause goes INSIDE the existing `classInstance` filter — a
      // second `classInstance` key would silently overwrite the window.
      this.prisma.client.booking.findMany({
        where: { classInstance: { startsAt: { gte: win.start, lt: win.end }, ...atBranch } },
        select: {
          status: true,
          classInstance: {
            select: {
              startsAt: true,
              endsAt: true,
              template: { select: { title: true } },
              classType: { select: { name: true } },
            },
          },
        },
      }),
      // NOT branch-filtered: `PtSession` has no location column, so
      // `ptSessionsOverTime` is every branch's PT even when a branch is selected.
      // Stage 6 adds `PtSession.locationId`.
      this.prisma.client.ptSession.findMany({
        where: {
          startsAt: { gte: win.start, lt: win.end },
          status: { not: InstanceStatus.CANCELED },
        },
        select: { startsAt: true },
      }),
    ]);

    const bookingBuckets = emptyBuckets(win, zone);
    const ptBuckets = emptyBuckets(win, zone);
    const capacityBuckets = emptyBuckets(win, zone);
    const seatBuckets = emptyBuckets(win, zone);
    const attendedBuckets = emptyBuckets(win, zone);
    const markedBuckets = emptyBuckets(win, zone);
    const demandByHour = Array.from({ length: HEATMAP_ROWS }, () =>
      new Array<number>(HEATMAP_COLS).fill(0),
    );
    const perType = new Map<string, TypeAgg>();

    /* -- Occurrences: capacity, sessions, classes held -------------------- */

    let classesHeld = 0;
    for (const instance of instances) {
      if (instance.status === InstanceStatus.CANCELED) continue;
      classesHeld += 1;

      const capacity =
        instance.capacityOverride ??
        instance.template?.capacity ??
        instance.classType?.capacity ??
        0;
      const key = bucketKey(instance.startsAt, win.bucket, zone);
      if (capacityBuckets.has(key)) {
        capacityBuckets.set(key, (capacityBuckets.get(key) ?? 0) + capacity);
      }

      const agg = typeAgg(perType, className(instance));
      agg.sessions += 1;
      agg.capacity += capacity;
    }

    /* -- Bookings: demand, attendance, coverage --------------------------- */

    let seatsBooked = 0;
    let attended = 0;
    let noShow = 0;
    let markedOnFinished = 0;
    let finished = 0;
    for (const row of bookings) {
      const occurrence = row.classInstance;
      const isMarked =
        row.status === BookingStatus.ATTENDED || row.status === BookingStatus.NO_SHOW;
      const heldSeat = SEAT_HOLDING.includes(row.status);

      // Coverage asks what COULD have been marked: a seat-holding booking on an
      // occurrence that has actually ended. Counted separately from the rate's own
      // denominator, which is every marked booking in the window — the two differ
      // if staff mark a class before it finishes.
      if (heldSeat && occurrence.endsAt < now) {
        finished += 1;
        if (isMarked) markedOnFinished += 1;
      }

      if (!heldSeat) continue;
      seatsBooked += 1;
      if (row.status === BookingStatus.ATTENDED) attended += 1;
      if (row.status === BookingStatus.NO_SHOW) noShow += 1;

      const key = bucketKey(occurrence.startsAt, win.bucket, zone);
      if (bookingBuckets.has(key)) {
        bookingBuckets.set(key, (bookingBuckets.get(key) ?? 0) + 1);
        seatBuckets.set(key, (seatBuckets.get(key) ?? 0) + 1);
        if (isMarked) {
          markedBuckets.set(key, (markedBuckets.get(key) ?? 0) + 1);
          if (row.status === BookingStatus.ATTENDED) {
            attendedBuckets.set(key, (attendedBuckets.get(key) ?? 0) + 1);
          }
        }
      }

      // Monday-first row, in the GYM'S calendar. Read in UTC this was wrong
      // twice: a 19:00 Tbilisi class landed in the 15:00 column of a chart whose
      // title is "when demand lands", and anything before 04:00 local also
      // landed in the previous day's ROW.
      const { weekday, hour } = zonedParts(occurrence.startsAt, zone);
      const cells = demandByHour[weekday];
      if (cells) cells[hour] = (cells[hour] ?? 0) + 1;

      typeAgg(perType, className(occurrence)).seatsBooked += 1;
    }

    for (const session of ptSessions) {
      const key = bucketKey(session.startsAt, win.bucket, zone);
      if (ptBuckets.has(key)) {
        ptBuckets.set(key, (ptBuckets.get(key) ?? 0) + 1);
      }
    }

    const totalCapacity = [...capacityBuckets.values()].reduce((sum, n) => sum + n, 0);
    const markedTotal = attended + noShow;

    return {
      granularity: query.granularity,
      kpis: {
        classesHeld,
        seatsBooked,
        noShowRate: markedTotal === 0 ? null : rate(noShow, markedTotal),
        utilizationRate: totalCapacity === 0 ? null : rate(seatsBooked, totalCapacity),
      },
      bookingsOverTime: [...bookingBuckets.entries()].map(([label, value]) => ({ label, value })),
      attendanceOverTime: [...markedBuckets.entries()].map(([label, total]) => ({
        label,
        value: total === 0 ? null : rate(attendedBuckets.get(label) ?? 0, total),
      })),
      utilizationOverTime: [...capacityBuckets.entries()].map(([label, capacity]) => ({
        label,
        value: capacity === 0 ? null : rate(seatBuckets.get(label) ?? 0, capacity),
      })),
      ptSessionsOverTime: [...ptBuckets.entries()].map(([label, value]) => ({ label, value })),
      topClassTypes: [...perType.entries()]
        .map(
          ([name, agg]): ClassTypeSlice => ({
            name,
            seatsBooked: agg.seatsBooked,
            sessions: agg.sessions,
            utilizationRate: agg.capacity === 0 ? null : rate(agg.seatsBooked, agg.capacity),
          }),
        )
        .sort((a, b) => b.seatsBooked - a.seatsBooked)
        .slice(0, TOP_CLASS_TYPES),
      demandByHour,
      markedCoverage: finished === 0 ? null : rate(markedOnFinished, finished),
    };
  }
}

/* -------------------------------------------------------------------------- */
/*  Pure helpers                                                               */
/* -------------------------------------------------------------------------- */

/**
 * What a class is CALLED. The same fallback `report-drilldown.service.ts` uses, so
 * one class is named the same thing on both surfaces.
 */
function className(row: {
  template: { title: string } | null;
  classType: { name: string } | null;
}): string {
  return row.template?.title ?? row.classType?.name ?? UNNAMED_CLASS;
}

/** The running totals for one class type, created on first use. */
function typeAgg(perType: Map<string, TypeAgg>, name: string): TypeAgg {
  let agg = perType.get(name);
  if (!agg) {
    agg = { seatsBooked: 0, sessions: 0, capacity: 0 };
    perType.set(name, agg);
  }
  return agg;
}
