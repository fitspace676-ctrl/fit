import { Injectable } from '@nestjs/common';
import { Prisma } from '@fit/db';
import type { AdminScheduleInstance, AdminScheduleQuery, AdminScheduleResponse } from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';

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
  constructor(private readonly prisma: TenantPrismaService) {}

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
