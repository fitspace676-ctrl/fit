import { Injectable, NotFoundException } from '@nestjs/common';
import { InstanceStatus, Prisma } from '@fit/db';
import type {
  AdminPtSession,
  AdminPtSessionsResponse,
  CreatePtSessionData,
  ListAdminPtSessionsQuery,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The columns the PT-calendar list / detail queries select off `PtSession`. */
const PT_SESSION_SELECT = {
  id: true,
  trainerId: true,
  classTypeId: true,
  startsAt: true,
  endsAt: true,
  status: true,
  notes: true,
  trainer: { select: { name: true } },
  classType: { select: { name: true, color: true } },
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
   * The chosen trainer's PT sessions whose `startsAt` falls in `[from, to)`,
   * ordered by `startsAt` (then `id` for a stable order among sessions sharing a
   * start). An empty list is a normal result.
   */
  async listPtSessions(query: ListAdminPtSessionsQuery): Promise<AdminPtSessionsResponse> {
    const rows = await this.prisma.client.ptSession.findMany({
      where: {
        trainerId: query.trainerId,
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
    await this.requireGymTrainer(data.trainerId);
    await this.requireGymClassType(data.classTypeId);

    const startsAt = new Date(data.startsAt);
    const endsAt = new Date(startsAt.getTime() + data.durationMinutes * 60 * 1000);

    const created = await this.prisma.client.ptSession.create({
      data: {
        gymId: this.tenant.gymId,
        trainerId: data.trainerId,
        classTypeId: data.classTypeId,
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
  private async requireGymTrainer(trainerId: string): Promise<void> {
    const trainer = await this.prisma.client.trainer.findFirst({
      where: { id: trainerId },
      select: { id: true },
    });
    if (!trainer) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }
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
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationMinutes: Math.round((row.endsAt.getTime() - row.startsAt.getTime()) / 60000),
    status: row.status,
    notes: row.notes,
  };
}
