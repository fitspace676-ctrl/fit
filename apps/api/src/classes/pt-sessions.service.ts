import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { InstanceStatus, Prisma } from '@fit/db';
import type {
  AdminPtSession,
  AdminPtSessionsResponse,
  CreatePtSessionData,
  ListAdminPtSessionsQuery,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { atLocation } from '../common/location-filter.util';

/** The columns the PT-calendar list / detail queries select off `PtSession`. */
const PT_SESSION_SELECT = {
  id: true,
  trainerId: true,
  classTypeId: true,
  locationId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  notes: true,
  trainer: { select: { name: true } },
  classType: { select: { name: true, color: true } },
  location: { select: { name: true } },
} satisfies Prisma.PtSessionSelect;

type PtSessionRecord = Prisma.PtSessionGetPayload<{ select: typeof PT_SESSION_SELECT }>;

/**
 * Staff-console PT-calendar management for a gym (the Classes hub's PT Calendar
 * tab). A PT session is a single block on a trainer's calendar for a workout type
 * (a class type) — no member — so this is its own surface rather than a reuse of
 * the class-schedule service.
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `ptSession`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym, so
 * staff only ever read or mutate their own gym's sessions. `status` reuses the
 * class {@link InstanceStatus} lifecycle: a session is `SCHEDULED`, then either
 * `COMPLETED` or `CANCELED` — never hard-deleted, so its history survives.
 */
@Injectable()
export class PtSessionsService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * PT sessions whose `startsAt` falls in `[from, to)`, ordered by `startsAt` (then
   * `id` for a stable order among sessions sharing a start). Every trainer's by
   * default; pass `trainerId` to narrow to one. An empty list is a normal result.
   */
  async listPtSessions(query: ListAdminPtSessionsQuery): Promise<AdminPtSessionsResponse> {
    const rows = await this.prisma.client.ptSession.findMany({
      where: {
        ...(query.trainerId ? { trainerId: query.trainerId } : {}),
        // The branch the hour is delivered at — a column of its own since Stage 6,
        // because a session is an event at a PLACE. Not the coach's roster (which
        // is many-valued and would leave "where is this" ambiguous for exactly the
        // coaches worth asking about) and not their base branch (a flagship coach
        // covering the satellite delivered that hour at the satellite).
        ...atLocation(query.locationId),
        startsAt: { gte: new Date(query.from), lt: new Date(query.to) },
      },
      select: PT_SESSION_SELECT,
      orderBy: [{ startsAt: 'asc' }, { id: 'asc' }],
    });
    return { sessions: rows.map((row) => toSession(row)) };
  }

  /**
   * Schedule a single PT session. The trainer and the workout type (class type)
   * must both belong to the caller's gym (the tenant-scoped `where` makes a
   * cross-tenant id a `404`). `endsAt` is derived from `durationMinutes` so it can
   * never drift. Runs on the tenant-scoped client, so `gymId` is pinned from the
   * session. Returns the new session.
   */
  async createPtSession(data: CreatePtSessionData): Promise<AdminPtSession> {
    const trainer = await this.requireGymTrainer(data.trainerId);
    await this.requireGymClassType(data.classTypeId);

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60 * 1000);
    const locationId = await this.resolveLocation(data.locationId, trainer.staffId);

    const created = await this.prisma.client.ptSession.create({
      data: {
        gymId: this.tenant.gymId,
        trainerId: data.trainerId,
        classTypeId: data.classTypeId,
        locationId,
        startsAt,
        endsAt,
        notes: data.notes,
        status: InstanceStatus.SCHEDULED,
      },
      select: { id: true },
    });

    return this.getPtSession(created.id);
  }

  /** One PT session in full. A missing / cross-tenant id is a `404 PT_SESSION_NOT_FOUND`. */
  async getPtSession(id: string): Promise<AdminPtSession> {
    const row = await this.prisma.client.ptSession.findFirst({
      where: { id },
      select: PT_SESSION_SELECT,
    });
    if (!row) {
      throw this.notFound();
    }
    return toSession(row);
  }

  /** Cancel a session (status `CANCELED`) — keeps the row for history. `404`-on-miss. */
  async cancelPtSession(id: string): Promise<AdminPtSession> {
    return this.setStatus(id, InstanceStatus.CANCELED);
  }

  /** Mark a session done (status `COMPLETED`) — the inverse-ish of {@link cancelPtSession}. */
  async completePtSession(id: string): Promise<AdminPtSession> {
    return this.setStatus(id, InstanceStatus.COMPLETED);
  }

  private async setStatus(id: string, status: InstanceStatus): Promise<AdminPtSession> {
    await this.requirePtSession(id);
    await this.prisma.client.ptSession.update({ where: { id }, data: { status } });
    return this.getPtSession(id);
  }

  /** Assert the session exists in the caller's gym; a miss is a `404 PT_SESSION_NOT_FOUND`. */
  private async requirePtSession(id: string): Promise<void> {
    const row = await this.prisma.client.ptSession.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw this.notFound();
    }
  }

  /** Resolve the trainer — tenant-scoped, so an unknown / cross-tenant id is a `404`. */
  private async requireGymTrainer(trainerId: string): Promise<{ staffId: string | null }> {
    const trainer = await this.prisma.client.trainer.findFirst({
      where: { id: trainerId },
      select: { id: true, staffId: true },
    });
    if (!trainer) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }
    return trainer;
  }

  /**
   * The branch a new session runs at, resolved in exactly three ways and never by
   * guessing — see {@link createPtSessionSchema}.
   *
   * A sent branch wins, after checking it is one of this gym's (the scoped client
   * constrains `gymId`, so a cross-tenant id simply does not resolve and is a
   * `422` rather than a foreign-key 500). Otherwise, if the coach is rostered at
   * exactly ONE branch, that is the only possible answer and taking it invents
   * nothing: the ambiguity Stage 6 refused to resolve through the roster exists
   * only for a coach who covers two sites. Otherwise `null`.
   *
   * What it deliberately never falls back to is the gym's DEFAULT branch, and this
   * is the one place where Stage 6 differs from Stages 2 and 3. A check-in is a
   * fact — somebody walked in — so attributing it to the default is lossy but
   * defensible. A PT session is a PLAN, and defaulting one asserts that an hour of
   * coaching happens at a door nobody booked; the utilisation and occupancy
   * figures downstream would then reconcile perfectly against something that never
   * happened. An unattributed session is a visible gap; a wrongly attributed one is
   * not.
   */
  private async resolveLocation(
    requested: string | undefined,
    staffId: string | null,
  ): Promise<string | null> {
    if (requested !== undefined) {
      const location = await this.prisma.client.location.findFirst({
        where: { id: requested },
        select: { id: true },
      });
      if (!location) {
        throw new UnprocessableEntityException({
          message: 'Pick a branch of this gym',
          code: 'LOCATION_INVALID',
        });
      }
      return location.id;
    }
    if (!staffId) {
      // An orphaned coach profile (`Trainer.staffId` is `SetNull`, so teaching
      // history survives the person leaving the directory) reaches no roster and
      // therefore no branch.
      return null;
    }
    // `take: 2` rather than `findMany()`: the question is "is there exactly one",
    // and two rows answer it as well as twenty.
    const assignments = await this.prisma.client.locationStaff.findMany({
      where: { staffId },
      select: { locationId: true },
      take: 2,
    });
    return assignments.length === 1 ? (assignments[0]?.locationId ?? null) : null;
  }

  /** Resolve the workout type (a class type) — tenant-scoped, so a cross-tenant id is a `404`. */
  private async requireGymClassType(classTypeId: string): Promise<void> {
    const classType = await this.prisma.client.classType.findFirst({
      where: { id: classTypeId },
      select: { id: true },
    });
    if (!classType) {
      throw new NotFoundException({
        message: 'Class type not found',
        code: 'CLASS_TYPE_NOT_FOUND',
      });
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ message: 'PT session not found', code: 'PT_SESSION_NOT_FOUND' });
  }
}

/** Project a PT-session row to the calendar block shape. */
function toSession(row: PtSessionRecord): AdminPtSession {
  return {
    id: row.id,
    trainerId: row.trainerId,
    trainerName: row.trainer.name,
    classTypeId: row.classTypeId,
    classTypeName: row.classType?.name ?? null,
    classTypeColor: row.classType?.color ?? null,
    locationId: row.locationId,
    locationName: row.location?.name ?? null,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000),
    status: row.status,
    notes: row.notes,
  };
}
