import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  ClassTemplateStatus,
  DEFAULT_WEEKS_AHEAD,
  InstanceStatus,
  planInstanceRegeneration,
  Prisma,
  type ExistingInstance,
} from '@fit/db';
import {
  describeRRule,
  type AdminClassTemplateDetail,
  type AdminClassTemplateRow,
  type CreateClassTemplateData,
  type CreateClassTemplateResponse,
  type GetAdminClassTemplateResponse,
  type ListAdminClassTemplatesQuery,
  type ListAdminClassTemplatesResponse,
  type SetClassTemplateStatusResponse,
  type UpdateClassTemplateData,
  type UpdateClassTemplateResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * The columns the roster/detail queries select off `ClassTemplate`. The default
 * trainer/location are pulled as a shallow relation (just the `name`) so a roster
 * row can show the trainer/branch without a second query; everything else is the
 * gym's own content.
 */
const CLASS_TEMPLATE_SELECT = {
  id: true,
  title: true,
  description: true,
  category: true,
  trainerId: true,
  locationId: true,
  room: true,
  capacity: true,
  durationMinutes: true,
  rrule: true,
  color: true,
  status: true,
  pricingRule: true,
  priceMinor: true,
  includedPlanIds: true,
  minAttendance: true,
  pt30Minor: true,
  pt45Minor: true,
  pt60Minor: true,
  validFrom: true,
  validUntil: true,
  createdAt: true,
  updatedAt: true,
  trainer: { select: { name: true } },
  location: { select: { name: true } },
} satisfies Prisma.ClassTemplateSelect;

type ClassTemplateRecord = Prisma.ClassTemplateGetPayload<{ select: typeof CLASS_TEMPLATE_SELECT }>;

/** Render a `Date` (a date-only validity bound) as a `YYYY-MM-DD` string. */
function toDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Parse a `YYYY-MM-DD` validity bound into a UTC midnight `Date` for storage. */
function fromDateString(date: string): Date {
  return new Date(`${date}T00:00:00.000Z`);
}

/**
 * Staff-console recurring class-template management for a gym (read + write,
 * T5.2).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `classTemplate`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym by
 * the Prisma tenant extension, so staff can only ever read or mutate their own
 * gym's templates — there is no `gymId` to pass or to forget. The roster is
 * paginated server-side so it scales without loading every template into memory.
 *
 * This service owns the editable shape of a class template, including the
 * RFC-5545 `rrule` recurrence the visual editor produces, the default seat
 * `capacity`, the per-occurrence `durationMinutes`, and the optional default
 * trainer / location (validated to belong to the same gym), mirroring how
 * {@link AdminPackagePlansService} owns a package plan's profile. It does not
 * materialise occurrences — that is the instance-generation job's job (T5.3).
 */
@Injectable()
export class AdminClassTemplatesService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of the gym's class templates, filtered + sorted server-side. `total`
   * is the filtered count (so the pager is accurate) and the page is bounded by
   * `skip`/`take`. An empty page is a normal result.
   */
  async listClassTemplates(
    query: ListAdminClassTemplatesQuery,
  ): Promise<ListAdminClassTemplatesResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.classTemplate.findMany({
        where,
        select: CLASS_TEMPLATE_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.classTemplate.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * One class template's detail for the detail / edit page. A missing id — or one
   * belonging to another tenant (the scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches) — is a `404 CLASS_TEMPLATE_NOT_FOUND`.
   */
  async getClassTemplate(id: string): Promise<GetAdminClassTemplateResponse> {
    const row = await this.prisma.client.classTemplate.findFirst({
      where: { id },
      select: CLASS_TEMPLATE_SELECT,
    });
    if (!row) {
      throw this.notFound();
    }
    return this.toDetail(row);
  }

  /**
   * Create a class template (T5.2). The whole insert runs on the tenant-scoped
   * client, so `gymId` is stamped from the request's tenant context by the
   * extension; it is also passed explicitly here as belt-and-braces and to satisfy
   * the create input's static type. The optional default trainer / location are
   * validated to belong to the same gym up front (a cross-tenant or unknown id is
   * a `400`). Returns the new template's detail (`201`).
   */
  async createClassTemplate(input: CreateClassTemplateData): Promise<CreateClassTemplateResponse> {
    await this.assertRelations(input.trainerId, input.locationId);

    const row = await this.prisma.client.classTemplate.create({
      data: {
        gymId: this.tenant.gymId,
        title: input.title,
        description: input.description,
        category: input.category,
        trainerId: input.trainerId,
        locationId: input.locationId,
        room: input.room,
        capacity: input.capacity,
        durationMinutes: input.durationMinutes,
        rrule: input.rrule,
        color: input.color,
        status: input.status,
        pricingRule: input.pricingRule,
        priceMinor: input.priceMinor,
        includedPlanIds: input.includedPlanIds,
        minAttendance: input.minAttendance,
        pt30Minor: input.pt30Minor,
        pt45Minor: input.pt45Minor,
        pt60Minor: input.pt60Minor,
        validFrom: fromDateString(input.validFrom),
        validUntil: input.validUntil ? fromDateString(input.validUntil) : null,
      },
      select: CLASS_TEMPLATE_SELECT,
    });
    return this.toDetail(row);
  }

  /**
   * Edit a class template's profile (T5.2). The id must resolve to a template in
   * the caller's gym (the scoped `where` makes a cross-tenant id a `404`); the
   * default trainer / location are re-validated against the gym. `status` is
   * deliberately not editable here — it moves through {@link pauseClassTemplate} /
   * {@link resumeClassTemplate}. Returns the updated detail.
   */
  async updateClassTemplate(
    id: string,
    input: UpdateClassTemplateData,
  ): Promise<UpdateClassTemplateResponse> {
    const { status } = await this.requireClassTemplate(id);
    await this.assertRelations(input.trainerId, input.locationId);

    const validFrom = fromDateString(input.validFrom);
    const validUntil = input.validUntil ? fromDateString(input.validUntil) : null;

    await this.prisma.client.classTemplate.update({
      where: { id },
      data: {
        title: input.title,
        description: input.description,
        category: input.category,
        trainerId: input.trainerId,
        locationId: input.locationId,
        room: input.room,
        capacity: input.capacity,
        durationMinutes: input.durationMinutes,
        rrule: input.rrule,
        color: input.color,
        pricingRule: input.pricingRule,
        priceMinor: input.priceMinor,
        includedPlanIds: input.includedPlanIds,
        minAttendance: input.minAttendance,
        pt30Minor: input.pt30Minor,
        pt45Minor: input.pt45Minor,
        pt60Minor: input.pt60Minor,
        validFrom,
        validUntil,
      },
    });

    // T5.8: reconcile already-materialised future occurrences against the edited
    // recurrence so the calendar reflects the change immediately, without waiting
    // for the next generation pass. Only ACTIVE templates materialise occurrences
    // — a PAUSED one keeps its existing instances and generates nothing, so its
    // instances are left exactly as they are (mirroring the generation job).
    if (status === ClassTemplateStatus.ACTIVE) {
      await this.regenerateInstances(id, {
        rrule: input.rrule,
        validFrom,
        validUntil,
        durationMinutes: input.durationMinutes,
      });
    }

    return this.getClassTemplate(id);
  }

  /**
   * Re-materialise a template's future occurrences after an edit (T5.8). Loads
   * the future instances inside the generation horizon, diffs them against the
   * new recurrence via {@link planInstanceRegeneration}, and applies the result:
   * new slots are inserted as `SCHEDULED`, surviving slots have `endsAt`
   * realigned to a changed duration, dropped slots with bookings are *detached*
   * (preserved so members keep their seat), and dropped unbooked slots are
   * deleted. Runs on the tenant-scoped client, so every read/write stays inside
   * the caller's gym. Past occurrences are never touched.
   */
  private async regenerateInstances(
    templateId: string,
    recurrence: {
      rrule: string;
      validFrom: Date;
      validUntil: Date | null;
      durationMinutes: number;
    },
  ): Promise<void> {
    const now = new Date();
    const windowEnd = new Date(now.getTime() + DEFAULT_WEEKS_AHEAD * 7 * 24 * 60 * 60 * 1000);

    const existing: ExistingInstance[] = await this.prisma.client.classInstance.findMany({
      where: { templateId, startsAt: { gte: now, lt: windowEnd } },
      select: {
        id: true,
        startsAt: true,
        endsAt: true,
        status: true,
        bookedCount: true,
        detachedAt: true,
      },
    });

    const plan = planInstanceRegeneration({ ...recurrence, existing, now });

    if (plan.toDelete.length > 0) {
      await this.prisma.client.classInstance.deleteMany({ where: { id: { in: plan.toDelete } } });
    }
    if (plan.toDetach.length > 0) {
      await this.prisma.client.classInstance.updateMany({
        where: { id: { in: plan.toDetach } },
        data: { detachedAt: now },
      });
    }
    for (const { id, endsAt } of plan.toRealign) {
      await this.prisma.client.classInstance.update({ where: { id }, data: { endsAt } });
    }
    if (plan.toCreate.length > 0) {
      await this.prisma.client.classInstance.createMany({
        data: plan.toCreate.map((startsAt) => ({
          gymId: this.tenant.gymId,
          templateId,
          startsAt,
          endsAt: new Date(startsAt.getTime() + recurrence.durationMinutes * 60 * 1000),
          status: InstanceStatus.SCHEDULED,
        })),
      });
    }
  }

  /**
   * Pause a class template (T5.2) — set `status` to `PAUSED` so the
   * instance-generation job stops materialising new occurrences while the
   * definition and any existing instances are preserved. Idempotent; `404`-on-miss.
   */
  async pauseClassTemplate(id: string): Promise<SetClassTemplateStatusResponse> {
    return this.setStatus(id, ClassTemplateStatus.PAUSED);
  }

  /**
   * Resume a class template (T5.2) — the inverse of {@link pauseClassTemplate},
   * setting `status` back to `ACTIVE`. Idempotent and `404`-on-miss like its
   * counterpart.
   */
  async resumeClassTemplate(id: string): Promise<SetClassTemplateStatusResponse> {
    return this.setStatus(id, ClassTemplateStatus.ACTIVE);
  }

  /** Set a template's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(
    id: string,
    status: ClassTemplateStatus,
  ): Promise<SetClassTemplateStatusResponse> {
    await this.requireClassTemplate(id);
    await this.prisma.client.classTemplate.update({ where: { id }, data: { status } });
    return this.getClassTemplate(id);
  }

  /**
   * Resolve a class template in the caller's gym or throw `404
   * CLASS_TEMPLATE_NOT_FOUND`. The scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches — the guard for every write.
   */
  private async requireClassTemplate(
    id: string,
  ): Promise<{ id: string; status: ClassTemplateStatus }> {
    const template = await this.prisma.client.classTemplate.findFirst({
      where: { id },
      select: { id: true, status: true },
    });
    if (!template) {
      throw this.notFound();
    }
    return template;
  }

  /**
   * Validate the optional default trainer / location both belong to the caller's
   * gym. The scoped client constrains each lookup to the tenant, so an unknown or
   * cross-tenant id resolves to nothing — surfaced as a `400` with the offending
   * field, rather than letting the foreign key fail opaquely on write.
   */
  private async assertRelations(
    trainerId: string | null,
    locationId: string | null,
  ): Promise<void> {
    if (trainerId) {
      const trainer = await this.prisma.client.trainer.findFirst({
        where: { id: trainerId },
        select: { id: true },
      });
      if (!trainer) {
        throw new BadRequestException(['trainerId: Trainer not found in this gym']);
      }
    }
    if (locationId) {
      const location = await this.prisma.client.location.findFirst({
        where: { id: locationId },
        select: { id: true },
      });
      if (!location) {
        throw new BadRequestException(['locationId: Location not found in this gym']);
      }
    }
  }

  /** The shared `404 CLASS_TEMPLATE_NOT_FOUND` for an unknown / cross-tenant id. */
  private notFound(): NotFoundException {
    return new NotFoundException({
      message: 'Class template not found',
      code: 'CLASS_TEMPLATE_NOT_FOUND',
    });
  }

  /**
   * The tenant-scoped `where` for the roster (the extension adds `gymId`), narrowed
   * by an optional `status` and a case-insensitive `search` across the template's
   * title + category.
   */
  private buildWhere(query: ListAdminClassTemplatesQuery): Prisma.ClassTemplateWhereInput {
    const where: Prisma.ClassTemplateWhereInput = {};

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { category: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Map the requested sort column to a Prisma `orderBy`. */
  private buildOrderBy(
    query: ListAdminClassTemplatesQuery,
  ): Prisma.ClassTemplateOrderByWithRelationInput {
    switch (query.sort) {
      case 'capacity':
        return { capacity: query.dir };
      case 'status':
        return { status: query.dir };
      case 'validFrom':
        return { validFrom: query.dir };
      case 'createdAt':
        return { createdAt: query.dir };
      case 'title':
      default:
        return { title: query.dir };
    }
  }

  /** Project a queried row to the denormalised roster {@link AdminClassTemplateRow}. */
  private toRow(row: ClassTemplateRecord): AdminClassTemplateRow {
    return {
      id: row.id,
      title: row.title,
      category: row.category,
      capacity: row.capacity,
      durationMinutes: row.durationMinutes,
      recurrence: describeRRule(row.rrule),
      color: row.color,
      trainerName: row.trainer?.name ?? null,
      locationName: row.location?.name ?? null,
      status: row.status,
      pricingRule: row.pricingRule,
      priceMinor: row.priceMinor,
      includedPlanIds: row.includedPlanIds,
      minAttendance: row.minAttendance,
      pt30Minor: row.pt30Minor,
      pt45Minor: row.pt45Minor,
      pt60Minor: row.pt60Minor,
      validFrom: toDateString(row.validFrom),
      validUntil: row.validUntil ? toDateString(row.validUntil) : null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Project a queried row to the full {@link AdminClassTemplateDetail}. */
  private toDetail(row: ClassTemplateRecord): AdminClassTemplateDetail {
    return {
      ...this.toRow(row),
      description: row.description,
      rrule: row.rrule,
      trainerId: row.trainerId,
      locationId: row.locationId,
      room: row.room,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
