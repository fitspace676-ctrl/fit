import { Injectable, NotFoundException } from '@nestjs/common';
import { PackagePlanStatus, Prisma } from '@fit/db';
import {
  type AdminPackagePlanDetail,
  type AdminPackagePlanRow,
  type CreatePackagePlanData,
  type CreatePackagePlanResponse,
  type GetAdminPackagePlanResponse,
  type ListAdminPackagePlansQuery,
  type ListAdminPackagePlansResponse,
  type SetPackagePlanStatusResponse,
  type UpdatePackagePlanData,
  type UpdatePackagePlanResponse,
} from '@fit/types';
import { availableAtLocation } from '../common/location-filter.util';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';
import { GymLocaleService } from '../gyms/gym-locale.service';

/**
 * The columns the roster/detail queries select off `PackagePlan`. Every field is
 * the gym's own content (no cross-tenant join), so the whole row is safe to
 * project.
 */
const PACKAGE_PLAN_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  currency: true,
  billingInterval: true,
  sessionCount: true,
  features: true,
  popular: true,
  status: true,
  locationId: true,
  // The branch this package is EXCLUSIVE to, joined for its name only. `null` —
  // almost every row — means it is sold at every branch, and there is nothing to
  // print.
  location: { select: { name: true } },
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.PackagePlanSelect;

type PackagePlanRecord = Prisma.PackagePlanGetPayload<{ select: typeof PACKAGE_PLAN_SELECT }>;

/**
 * Staff-console personal-training package-plan management for a gym (read + write,
 * T4.11).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every `packagePlan`
 * query is auto-constrained to (and, on create, stamped with) the caller's gym by
 * the Prisma tenant extension, so staff can only ever read or mutate their own
 * gym's plans — there is no `gymId` to pass or to forget. The roster is paginated
 * server-side so it scales without loading every plan into memory.
 *
 * This service owns the editable shape of a package plan, including the billing
 * cadence, the optional session count, and the flat ordered `features` list,
 * mirroring how {@link AdminProductsService} owns a product's profile and
 * {@link AdminLocationsService} owns a location's `amenities`.
 */
@Injectable()
export class AdminPackagePlansService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
    private readonly locale: GymLocaleService,
  ) {}

  /**
   * One page of the gym's package plans, filtered + sorted server-side. `total` is
   * the filtered count (so the pager is accurate) and the page is bounded by
   * `skip`/`take`. An empty page is a normal result.
   */
  async listPackagePlans(
    query: ListAdminPackagePlansQuery,
  ): Promise<ListAdminPackagePlansResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.packagePlan.findMany({
        where,
        select: PACKAGE_PLAN_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.packagePlan.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * One package plan's detail for the detail / edit page. A missing id — or one
   * belonging to another tenant (the scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches) — is a `404 PACKAGE_PLAN_NOT_FOUND`.
   */
  async getPackagePlan(id: string): Promise<GetAdminPackagePlanResponse> {
    const row = await this.prisma.client.packagePlan.findFirst({
      where: { id },
      select: PACKAGE_PLAN_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Package plan not found',
        code: 'PACKAGE_PLAN_NOT_FOUND',
      });
    }
    return this.toDetail(row);
  }

  /**
   * Create a package plan (T4.11). The whole insert runs on the tenant-scoped
   * client, so `gymId` is stamped from the request's tenant context by the
   * extension; it is also passed explicitly here as belt-and-braces and to satisfy
   * the create input's static type. Returns the new plan's detail (`201`).
   */
  async createPackagePlan(input: CreatePackagePlanData): Promise<CreatePackagePlanResponse> {
    const row = await this.prisma.client.packagePlan.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        // Priced in the gym's own configured currency (Settings → General), never
        // a client-supplied one — a gym sells in exactly one currency.
        currency: (await this.locale.get()).currency,
        billingInterval: input.billingInterval,
        sessionCount: input.sessionCount,
        features: input.features,
        popular: input.popular,
        status: input.status,
        // The branch this package is EXCLUSIVE to. `null` means sold everywhere,
        // and is deliberately NOT seeded from the console's active branch: doing
        // so would restrict every new package to whichever branch the operator
        // happened to have selected.
        locationId: input.locationId,
      },
      select: PACKAGE_PLAN_SELECT,
    });
    return this.toDetail(row);
  }

  /**
   * Edit a package plan's profile (T4.11). The id must resolve to a plan in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). `status` is
   * deliberately not editable here — it moves through {@link deactivatePackagePlan}
   * / {@link reactivatePackagePlan}. Returns the updated detail.
   */
  async updatePackagePlan(
    id: string,
    input: UpdatePackagePlanData,
  ): Promise<UpdatePackagePlanResponse> {
    await this.requirePackagePlan(id);
    await this.prisma.client.packagePlan.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        // `currency` is untouched on edit: an existing plan keeps the currency its
        // members were signed up in.
        billingInterval: input.billingInterval,
        sessionCount: input.sessionCount,
        features: input.features,
        popular: input.popular,
        // The edit form posts the whole profile, so an omitted branch widens the
        // package back to every branch — the same way an omitted `features` list
        // clears it.
        locationId: input.locationId,
      },
    });
    return this.getPackagePlan(id);
  }

  /**
   * Deactivate a package plan (T4.11) — set `status` to `INACTIVE` so it drops off
   * any storefront while the record is preserved. Idempotent; `404`-on-miss.
   */
  async deactivatePackagePlan(id: string): Promise<SetPackagePlanStatusResponse> {
    return this.setStatus(id, PackagePlanStatus.INACTIVE);
  }

  /**
   * Reactivate a package plan (T4.11) — the inverse of
   * {@link deactivatePackagePlan}, setting `status` back to `ACTIVE`. Idempotent
   * and `404`-on-miss like its counterpart.
   */
  async reactivatePackagePlan(id: string): Promise<SetPackagePlanStatusResponse> {
    return this.setStatus(id, PackagePlanStatus.ACTIVE);
  }

  /** Set a plan's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(
    id: string,
    status: PackagePlanStatus,
  ): Promise<SetPackagePlanStatusResponse> {
    await this.requirePackagePlan(id);
    await this.prisma.client.packagePlan.update({ where: { id }, data: { status } });
    return this.getPackagePlan(id);
  }

  /**
   * Resolve a package plan in the caller's gym or throw `404
   * PACKAGE_PLAN_NOT_FOUND`. The scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches — the guard for every write.
   */
  private async requirePackagePlan(id: string): Promise<{ id: string }> {
    const plan = await this.prisma.client.packagePlan.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!plan) {
      throw new NotFoundException({
        message: 'Package plan not found',
        code: 'PACKAGE_PLAN_NOT_FOUND',
      });
    }
    return plan;
  }

  /**
   * The tenant-scoped `where` for the roster (the extension adds `gymId`), narrowed
   * by an optional `status` and a case-insensitive `search` across the plan's
   * name + description.
   */
  private buildWhere(query: ListAdminPackagePlansQuery): Prisma.PackagePlanWhereInput {
    // The branch filter is {@link availableAtLocation}, NOT `atLocation`: a NULL
    // `PackagePlan.locationId` means "sold at every branch", so plain equality
    // would return only this branch's exclusives — an empty catalogue for almost
    // every gym. It spreads as a nested `AND` precisely so the `OR` the search
    // below sets cannot clobber it.
    const where: Prisma.PackagePlanWhereInput = { ...availableAtLocation(query.locationId) };

    if (query.status) {
      where.status = query.status;
    }

    const search = query.search?.trim();
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    return where;
  }

  /** Map the requested sort column to a Prisma `orderBy`. */
  private buildOrderBy(
    query: ListAdminPackagePlansQuery,
  ): Prisma.PackagePlanOrderByWithRelationInput {
    switch (query.sort) {
      case 'price':
        return { priceAmount: query.dir };
      case 'status':
        return { status: query.dir };
      case 'createdAt':
        return { createdAt: query.dir };
      case 'name':
      default:
        return { name: query.dir };
    }
  }

  /** Project a queried row to the denormalised roster {@link AdminPackagePlanRow}. */
  private toRow(row: PackagePlanRecord): AdminPackagePlanRow {
    return {
      id: row.id,
      name: row.name,
      priceAmount: row.priceAmount,
      currency: row.currency,
      billingInterval: row.billingInterval,
      sessionCount: row.sessionCount,
      featureCount: row.features.length,
      popular: row.popular,
      status: row.status,
      locationName: row.location?.name ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Project a queried row to the full {@link AdminPackagePlanDetail}. */
  private toDetail(row: PackagePlanRecord): AdminPackagePlanDetail {
    return {
      ...this.toRow(row),
      description: row.description,
      features: row.features,
      locationId: row.locationId,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
