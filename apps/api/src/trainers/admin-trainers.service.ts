import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, TrainerStatus } from '@fit/db';
import type {
  AdminTrainerDetail,
  AdminTrainerRow,
  CreateTrainerData,
  CreateTrainerResponse,
  GetAdminTrainerResponse,
  ListAdminTrainersQuery,
  ListAdminTrainersResponse,
  SetTrainerStatusResponse,
  UpdateTrainerData,
  UpdateTrainerResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * The columns the roster/detail queries select off `Trainer`. Every field is the
 * gym's own content (no cross-tenant join), so the whole row is safe to project.
 */
const TRAINER_SELECT = {
  id: true,
  name: true,
  headline: true,
  bio: true,
  photoUrl: true,
  specialties: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.TrainerSelect;

type TrainerRecord = Prisma.TrainerGetPayload<{ select: typeof TRAINER_SELECT }>;

/**
 * Staff-console trainer management for a gym (read + write, T4.4).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `trainer`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym by
 * the Prisma tenant extension, so staff can only ever read or mutate their own
 * gym's trainers — there is no `gymId` to pass or to forget. The roster is
 * paginated server-side so it scales without loading every trainer into memory.
 *
 * The managed record here is the source the *public* trainers index (`GET
 * /trainers`, T3.6) ultimately surfaces; this service owns the editable shape,
 * including the R2-hosted `photoUrl` the admin form uploads.
 */
@Injectable()
export class AdminTrainersService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of the gym's trainers, filtered + sorted server-side. `total` is the
   * filtered count (so the pager is accurate) and the page is bounded by
   * `skip`/`take`. An empty page is a normal result.
   */
  async listTrainers(query: ListAdminTrainersQuery): Promise<ListAdminTrainersResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.trainer.findMany({
        where,
        select: TRAINER_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.trainer.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * One trainer's detail for the detail / edit page. A missing id — or one
   * belonging to another tenant (the scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches) — is a `404 TRAINER_NOT_FOUND`.
   */
  async getTrainer(id: string): Promise<GetAdminTrainerResponse> {
    const row = await this.prisma.client.trainer.findFirst({
      where: { id },
      select: TRAINER_SELECT,
    });
    if (!row) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }
    return this.toDetail(row);
  }

  /**
   * Create a trainer (T4.4). The whole insert runs on the tenant-scoped client, so
   * `gymId` is stamped from the request's tenant context by the extension; it is
   * also passed explicitly here as belt-and-braces and to satisfy the create
   * input's static type. Returns the new trainer's detail (`201`).
   */
  async createTrainer(input: CreateTrainerData): Promise<CreateTrainerResponse> {
    const row = await this.prisma.client.trainer.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        headline: input.headline,
        bio: input.bio,
        photoUrl: input.photoUrl,
        specialties: input.specialties,
        status: input.status,
      },
      select: TRAINER_SELECT,
    });
    return this.toDetail(row);
  }

  /**
   * Edit a trainer's profile (T4.4). The id must resolve to a trainer in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). `status` is
   * deliberately not editable here — it moves through {@link deactivateTrainer} /
   * {@link reactivateTrainer}. Returns the updated detail.
   */
  async updateTrainer(id: string, input: UpdateTrainerData): Promise<UpdateTrainerResponse> {
    await this.requireTrainer(id);
    await this.prisma.client.trainer.update({
      where: { id },
      data: {
        name: input.name,
        headline: input.headline,
        bio: input.bio,
        photoUrl: input.photoUrl,
        specialties: input.specialties,
      },
    });
    return this.getTrainer(id);
  }

  /**
   * Deactivate a trainer (T4.4) — set `status` to `INACTIVE` so they drop off the
   * public roster while the record is preserved. Idempotent; `404`-on-miss.
   */
  async deactivateTrainer(id: string): Promise<SetTrainerStatusResponse> {
    return this.setStatus(id, TrainerStatus.INACTIVE);
  }

  /**
   * Reactivate a trainer (T4.4) — the inverse of {@link deactivateTrainer}, setting
   * `status` back to `ACTIVE`. Idempotent and `404`-on-miss like its counterpart.
   */
  async reactivateTrainer(id: string): Promise<SetTrainerStatusResponse> {
    return this.setStatus(id, TrainerStatus.ACTIVE);
  }

  /** Set a trainer's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(id: string, status: TrainerStatus): Promise<SetTrainerStatusResponse> {
    await this.requireTrainer(id);
    await this.prisma.client.trainer.update({ where: { id }, data: { status } });
    return this.getTrainer(id);
  }

  /**
   * Resolve a trainer in the caller's gym or throw `404 TRAINER_NOT_FOUND`. The
   * scoped `where` constrains `gymId`, so a cross-tenant id never matches — the
   * guard for every write.
   */
  private async requireTrainer(id: string): Promise<{ id: string }> {
    const trainer = await this.prisma.client.trainer.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!trainer) {
      throw new NotFoundException({ message: 'Trainer not found', code: 'TRAINER_NOT_FOUND' });
    }
    return trainer;
  }

  /**
   * The tenant-scoped `where` for the roster (the extension adds `gymId`), narrowed
   * by an optional `status` and a case-insensitive `search` across the trainer's
   * name + headline.
   */
  private buildWhere(query: ListAdminTrainersQuery): Prisma.TrainerWhereInput {
    const where: Prisma.TrainerWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { headline: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Map the requested sort column to a Prisma `orderBy`. */
  private buildOrderBy(query: ListAdminTrainersQuery): Prisma.TrainerOrderByWithRelationInput {
    switch (query.sort) {
      case 'status':
        return { status: query.dir };
      case 'createdAt':
        return { createdAt: query.dir };
      case 'name':
      default:
        return { name: query.dir };
    }
  }

  /** Project a queried row to the denormalised roster {@link AdminTrainerRow}. */
  private toRow(row: TrainerRecord): AdminTrainerRow {
    return {
      id: row.id,
      name: row.name,
      headline: row.headline,
      photoUrl: row.photoUrl,
      specialties: row.specialties,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Project a queried row to the full {@link AdminTrainerDetail}. */
  private toDetail(row: TrainerRecord): AdminTrainerDetail {
    return {
      ...this.toRow(row),
      bio: row.bio,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
