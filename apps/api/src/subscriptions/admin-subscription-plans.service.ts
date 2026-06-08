import { Injectable, NotFoundException } from '@nestjs/common';
import { SubscriptionPlanStatus, Prisma } from '@fit/db';
import {
  type AdminSubscriptionPlanDetail,
  type AdminSubscriptionPlanRow,
  type CreateSubscriptionPlanData,
  type CreateSubscriptionPlanResponse,
  type GetAdminSubscriptionPlanResponse,
  type ListAdminSubscriptionPlansQuery,
  type ListAdminSubscriptionPlansResponse,
  type SetSubscriptionPlanStatusResponse,
  type UpdateSubscriptionPlanData,
  type UpdateSubscriptionPlanResponse,
} from '@fit/types';
import { TenantPrismaService } from '../common/prisma/tenant-prisma.service';
import { TenantContext } from '../common/tenant/tenant.context';

/**
 * The columns the roster/detail queries select off `SubscriptionPlan`. Every field
 * is the gym's own content (no cross-tenant join), so the whole row is safe to
 * project.
 */
const SUBSCRIPTION_PLAN_SELECT = {
  id: true,
  name: true,
  description: true,
  priceAmount: true,
  currency: true,
  interval: true,
  features: true,
  popular: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.SubscriptionPlanSelect;

type SubscriptionPlanRecord = Prisma.SubscriptionPlanGetPayload<{
  select: typeof SUBSCRIPTION_PLAN_SELECT;
}>;

/**
 * Staff-console recurring-membership subscription-plan management for a gym (read +
 * write, T8.2).
 *
 * Runs on the **tenant-scoped** {@link TenantPrismaService}: every
 * `subscriptionPlan` query is auto-constrained to (and, on create, stamped with)
 * the caller's gym by the Prisma tenant extension, so staff can only ever read or
 * mutate their own gym's plans — there is no `gymId` to pass or to forget. The
 * roster is paginated server-side so it scales without loading every plan into
 * memory.
 *
 * This service owns the editable shape of a subscription plan, including the
 * renewal cadence and the flat ordered `features` list, mirroring how
 * {@link AdminPackagePlansService} owns a package plan's profile — but for a
 * *recurring* membership (no `sessionCount`, `MONTH`/`YEAR` only).
 */
@Injectable()
export class AdminSubscriptionPlansService {
  constructor(
    private readonly prisma: TenantPrismaService,
    private readonly tenant: TenantContext,
  ) {}

  /**
   * One page of the gym's subscription plans, filtered + sorted server-side.
   * `total` is the filtered count (so the pager is accurate) and the page is
   * bounded by `skip`/`take`. An empty page is a normal result.
   */
  async listSubscriptionPlans(
    query: ListAdminSubscriptionPlansQuery,
  ): Promise<ListAdminSubscriptionPlansResponse> {
    const where = this.buildWhere(query);
    const skip = (query.page - 1) * query.limit;

    const [rows, total] = await Promise.all([
      this.prisma.client.subscriptionPlan.findMany({
        where,
        select: SUBSCRIPTION_PLAN_SELECT,
        orderBy: this.buildOrderBy(query),
        skip,
        take: query.limit,
      }),
      this.prisma.client.subscriptionPlan.count({ where }),
    ]);

    return {
      data: rows.map((row) => this.toRow(row)),
      total,
      page: query.page,
      limit: query.limit,
    };
  }

  /**
   * One subscription plan's detail for the detail / edit page. A missing id — or
   * one belonging to another tenant (the scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches) — is a `404 SUBSCRIPTION_PLAN_NOT_FOUND`.
   */
  async getSubscriptionPlan(id: string): Promise<GetAdminSubscriptionPlanResponse> {
    const row = await this.prisma.client.subscriptionPlan.findFirst({
      where: { id },
      select: SUBSCRIPTION_PLAN_SELECT,
    });
    if (!row) {
      throw new NotFoundException({
        message: 'Subscription plan not found',
        code: 'SUBSCRIPTION_PLAN_NOT_FOUND',
      });
    }
    return this.toDetail(row);
  }

  /**
   * Create a subscription plan (T8.2). The whole insert runs on the tenant-scoped
   * client, so `gymId` is stamped from the request's tenant context by the
   * extension; it is also passed explicitly here as belt-and-braces and to satisfy
   * the create input's static type. Returns the new plan's detail (`201`).
   */
  async createSubscriptionPlan(
    input: CreateSubscriptionPlanData,
  ): Promise<CreateSubscriptionPlanResponse> {
    const row = await this.prisma.client.subscriptionPlan.create({
      data: {
        gymId: this.tenant.gymId,
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        currency: input.currency,
        interval: input.interval,
        features: input.features,
        popular: input.popular,
        status: input.status,
      },
      select: SUBSCRIPTION_PLAN_SELECT,
    });
    return this.toDetail(row);
  }

  /**
   * Edit a subscription plan's profile (T8.2). The id must resolve to a plan in the
   * caller's gym (the scoped `where` makes a cross-tenant id a `404`). `status` is
   * deliberately not editable here — it moves through
   * {@link deactivateSubscriptionPlan} / {@link reactivateSubscriptionPlan}.
   * Returns the updated detail.
   */
  async updateSubscriptionPlan(
    id: string,
    input: UpdateSubscriptionPlanData,
  ): Promise<UpdateSubscriptionPlanResponse> {
    await this.requireSubscriptionPlan(id);
    await this.prisma.client.subscriptionPlan.update({
      where: { id },
      data: {
        name: input.name,
        description: input.description,
        priceAmount: input.priceAmount,
        currency: input.currency,
        interval: input.interval,
        features: input.features,
        popular: input.popular,
      },
    });
    return this.getSubscriptionPlan(id);
  }

  /**
   * Deactivate a subscription plan (T8.2) — set `status` to `INACTIVE` so it drops
   * off any storefront / member portal while the record (and any
   * {@link Subscription} linked to it) is preserved. Idempotent; `404`-on-miss.
   */
  async deactivateSubscriptionPlan(id: string): Promise<SetSubscriptionPlanStatusResponse> {
    return this.setStatus(id, SubscriptionPlanStatus.INACTIVE);
  }

  /**
   * Reactivate a subscription plan (T8.2) — the inverse of
   * {@link deactivateSubscriptionPlan}, setting `status` back to `ACTIVE`.
   * Idempotent and `404`-on-miss like its counterpart.
   */
  async reactivateSubscriptionPlan(id: string): Promise<SetSubscriptionPlanStatusResponse> {
    return this.setStatus(id, SubscriptionPlanStatus.ACTIVE);
  }

  /** Set a plan's lifecycle `status`, 404-ing an unknown / cross-tenant id. */
  private async setStatus(
    id: string,
    status: SubscriptionPlanStatus,
  ): Promise<SetSubscriptionPlanStatusResponse> {
    await this.requireSubscriptionPlan(id);
    await this.prisma.client.subscriptionPlan.update({ where: { id }, data: { status } });
    return this.getSubscriptionPlan(id);
  }

  /**
   * Resolve a subscription plan in the caller's gym or throw `404
   * SUBSCRIPTION_PLAN_NOT_FOUND`. The scoped `where` constrains `gymId`, so a
   * cross-tenant id never matches — the guard for every write.
   */
  private async requireSubscriptionPlan(id: string): Promise<{ id: string }> {
    const plan = await this.prisma.client.subscriptionPlan.findFirst({
      where: { id },
      select: { id: true },
    });
    if (!plan) {
      throw new NotFoundException({
        message: 'Subscription plan not found',
        code: 'SUBSCRIPTION_PLAN_NOT_FOUND',
      });
    }
    return plan;
  }

  /**
   * The tenant-scoped `where` for the roster (the extension adds `gymId`), narrowed
   * by an optional `status` and a case-insensitive `search` across the plan's
   * name + description.
   */
  private buildWhere(query: ListAdminSubscriptionPlansQuery): Prisma.SubscriptionPlanWhereInput {
    const where: Prisma.SubscriptionPlanWhereInput = {};

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
    query: ListAdminSubscriptionPlansQuery,
  ): Prisma.SubscriptionPlanOrderByWithRelationInput {
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

  /** Project a queried row to the denormalised roster {@link AdminSubscriptionPlanRow}. */
  private toRow(row: SubscriptionPlanRecord): AdminSubscriptionPlanRow {
    return {
      id: row.id,
      name: row.name,
      priceAmount: row.priceAmount,
      currency: row.currency,
      interval: row.interval,
      featureCount: row.features.length,
      popular: row.popular,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    };
  }

  /** Project a queried row to the full {@link AdminSubscriptionPlanDetail}. */
  private toDetail(row: SubscriptionPlanRecord): AdminSubscriptionPlanDetail {
    return {
      ...this.toRow(row),
      description: row.description,
      features: row.features,
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
