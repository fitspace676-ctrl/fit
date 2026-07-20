import { Injectable, NotFoundException } from '@nestjs/common';
import { ClassTypeStatus, Prisma } from '@fit/db';
import type {
  AdminClassTypeDetail,
  AdminClassTypeOption,
  AdminClassTypeRow,
  CreateClassTypeData,
  GetAdminClassTypeResponse,
  ListAdminClassTypesQuery,
  ListAdminClassTypesResponse,
  UpdateClassTypeData,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/** The columns the roster / detail queries select off `ClassType`. */
const CLASS_TYPE_SELECT = {
  id: true,
  name: true,
  description: true,
  durationMinutes: true,
  capacity: true,
  minAttendance: true,
  color: true,
  pricingRule: true,
  priceMinor: true,
  includedPlanIds: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.ClassTypeSelect;

type ClassTypeRecord = Prisma.ClassTypeGetPayload<{ select: typeof CLASS_TYPE_SELECT }>;

/**
 * Staff-console class-type catalogue management for a gym (read + write).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `classType`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym,
 * so staff only ever read or mutate their own gym's types — there is no `gymId`
 * to pass or to forget. A type carries the reusable defaults a scheduled
 * occurrence inherits; it owns no schedule of its own. `status` soft-retires a
 * type (INACTIVE) rather than deleting it, so its past occurrences survive.
 */
@Injectable()
export class ClassTypesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of the gym's class types, filtered + sorted server-side. `total` is
   * the filtered count so the pager is accurate. An empty page is a normal result.
   */
  async listClassTypes(query: ListAdminClassTypesQuery): Promise<ListAdminClassTypesResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.classType.findMany({
        where,
        select: CLASS_TYPE_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.classType.count({ where }),
    ]);

    return {
      data: rows.map((row) => toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * The gym's active class types as slim options for the schedule's type-picker,
   * ordered by name — enough to preview the occurrence each would create.
   */
  async listActiveOptions(): Promise<AdminClassTypeOption[]> {
    const rows = await this.prisma.client.classType.findMany({
      where: { status: ClassTypeStatus.ACTIVE },
      select: { id: true, name: true, durationMinutes: true, capacity: true, color: true },
      orderBy: { name: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      name: row.name,
      durationMinutes: row.durationMinutes,
      capacity: row.capacity,
      color: row.color,
    }));
  }

  /**
   * One class type's detail for the detail / edit form. A missing id — or one
   * belonging to another tenant (the scoped `where` constrains `gymId`) — is a
   * `404 CLASS_TYPE_NOT_FOUND`.
   */
  async getClassType(id: string): Promise<GetAdminClassTypeResponse> {
    const row = await this.prisma.client.classType.findFirst({
      where: { id },
      select: CLASS_TYPE_SELECT,
    });
    if (!row) {
      throw this.notFound();
    }
    return toDetail(row);
  }

  /**
   * Create a class type. The whole insert runs on the tenant-scoped client, so
   * `gymId` is stamped from the request's tenant context; it is passed explicitly
   * here as belt-and-braces and to satisfy the create input's static type. Returns
   * the new type's detail (`201`).
   */
  async createClassType(input: CreateClassTypeData): Promise<AdminClassTypeDetail> {
    const row = await this.prisma.client.classType.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        capacity: input.capacity,
        minAttendance: input.minAttendance,
        color: input.color,
        pricingRule: input.pricingRule,
        priceMinor: input.priceMinor,
        includedPlanIds: input.includedPlanIds,
        status: input.status,
      },
      select: CLASS_TYPE_SELECT,
    });
    return toDetail(row);
  }

  /**
   * Edit a class type's profile. The id must resolve to a type in the caller's gym
   * (the scoped `where` makes a cross-tenant id a `404`). Only the fields present
   * in the (partial) body are changed — an omitted field is left untouched. Returns
   * the updated detail.
   */
  async updateClassType(id: string, input: UpdateClassTypeData): Promise<AdminClassTypeDetail> {
    await this.requireClassType(id);
    await this.prisma.client.classType.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        durationMinutes: input.durationMinutes,
        capacity: input.capacity,
        minAttendance: input.minAttendance,
        color: input.color,
        pricingRule: input.pricingRule,
        priceMinor: input.priceMinor,
        includedPlanIds: input.includedPlanIds,
        status: input.status,
      },
    });
    return this.getClassType(id);
  }

  /** Soft-retire a type (status `INACTIVE`) — hides it from the scheduler without
   * touching its past occurrences. Idempotent; `404`-on-miss. */
  async deactivateClassType(id: string): Promise<AdminClassTypeDetail> {
    return this.setStatus(id, ClassTypeStatus.INACTIVE);
  }

  /** Reactivate a type (status `ACTIVE`) — the inverse of {@link deactivateClassType}. */
  async activateClassType(id: string): Promise<AdminClassTypeDetail> {
    return this.setStatus(id, ClassTypeStatus.ACTIVE);
  }

  private async setStatus(id: string, status: ClassTypeStatus): Promise<AdminClassTypeDetail> {
    await this.requireClassType(id);
    await this.prisma.client.classType.update({ where: { id }, data: { status } });
    return this.getClassType(id);
  }

  /** Assert the type exists in the caller's gym; a miss is a `404 CLASS_TYPE_NOT_FOUND`. */
  private async requireClassType(id: string): Promise<void> {
    const row = await this.prisma.client.classType.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!row) {
      throw this.notFound();
    }
  }

  private notFound(): NotFoundException {
    return new NotFoundException({ message: 'Class type not found', code: 'CLASS_TYPE_NOT_FOUND' });
  }

  private buildWhere(query: ListAdminClassTypesQuery): Prisma.ClassTypeWhereInput {
    const where: Prisma.ClassTypeWhereInput = {};
    if (query.status) {
      where.status = query.status;
    }
    const search = query.search?.trim();
    if (search) {
      where.name = { contains: search, mode: 'insensitive' };
    }
    return where;
  }

  private buildOrderBy(query: ListAdminClassTypesQuery): Prisma.ClassTypeOrderByWithRelationInput {
    switch (query.sort) {
      case 'capacity':
        return { capacity: query.dir };
      case 'status':
        return { status: query.dir };
      case 'createdAt':
        return { createdAt: query.dir };
      case 'name':
      default:
        return { name: query.dir };
    }
  }
}

/** Project a class-type row to the roster row shape. */
function toRow(row: ClassTypeRecord): AdminClassTypeRow {
  return {
    id: row.id,
    name: row.name,
    durationMinutes: row.durationMinutes,
    capacity: row.capacity,
    minAttendance: row.minAttendance,
    color: row.color,
    status: row.status,
    pricingRule: row.pricingRule,
    priceMinor: row.priceMinor,
    includedPlanIds: row.includedPlanIds,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Project a class-type row to the detail shape (the row plus description + updatedAt). */
function toDetail(row: ClassTypeRecord): AdminClassTypeDetail {
  return {
    ...toRow(row),
    description: row.description,
    updatedAt: row.updatedAt.toISOString(),
  };
}
