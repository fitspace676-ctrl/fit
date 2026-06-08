import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createSubscriptionPlanSchema,
  listAdminSubscriptionPlansQuerySchema,
  updateSubscriptionPlanSchema,
  type CreateSubscriptionPlanResponse,
  type GetAdminSubscriptionPlanResponse,
  type ListAdminSubscriptionPlansResponse,
  type SetSubscriptionPlanStatusResponse,
  type UpdateSubscriptionPlanResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminSubscriptionPlansService } from './admin-subscription-plans.service';

/**
 * Staff-console recurring-membership subscription-plan management API
 * (`/admin/subscriptions`, T8.2).
 *
 * Mounted under `/admin/subscriptions` (mirroring `admin/packages`) so it sits
 * alongside the staff console's other tenant-scoped management surfaces. Every
 * route here is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability. Reads require
 * {@link Permission.BillingRead}; the writes — create, edit, and
 * deactivate/reactivate — require {@link Permission.BillingManage} (whose grant
 * covers "subscriptions, plans, and payment settings"). The service runs on the
 * tenant-scoped Prisma client, so no handler ever passes a `gymId`.
 */
@Controller('admin/subscriptions')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminSubscriptionPlansController {
  constructor(private readonly plans: AdminSubscriptionPlansService) {}

  /**
   * `GET /admin/subscriptions?page&limit&search&status&sort&dir` — one filtered,
   * server-paginated page of the gym's subscription plans. The query is validated
   * up front (a bad page/limit/status is a `400` with per-field detail) so the
   * service only sees a well-formed, defaulted request. An empty page is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingRead)
  async list(@Query() query: unknown): Promise<ListAdminSubscriptionPlansResponse> {
    return this.plans.listSubscriptionPlans(parse(listAdminSubscriptionPlansQuerySchema, query));
  }

  /**
   * `GET /admin/subscriptions/:id` — one subscription plan's detail. An unknown or
   * cross-tenant id is a `404 SUBSCRIPTION_PLAN_NOT_FOUND` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingRead)
  async getOne(@Param('id') id: string): Promise<GetAdminSubscriptionPlanResponse> {
    return this.plans.getSubscriptionPlan(id);
  }

  /**
   * `POST /admin/subscriptions` — create a subscription plan (T8.2). The body is
   * validated up front (`name` required; the rest optional with defaults, `status`
   * defaults to `ACTIVE`). Returns `201` with the detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.BillingManage)
  async create(@Body() body: unknown): Promise<CreateSubscriptionPlanResponse> {
    return this.plans.createSubscriptionPlan(parse(createSubscriptionPlanSchema, body));
  }

  /**
   * `PATCH /admin/subscriptions/:id` — edit a subscription plan's profile (T8.2).
   * An unknown or cross-tenant id is a `404 SUBSCRIPTION_PLAN_NOT_FOUND`. Returns
   * the updated detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingManage)
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UpdateSubscriptionPlanResponse> {
    return this.plans.updateSubscriptionPlan(id, parse(updateSubscriptionPlanSchema, body));
  }

  /**
   * `POST /admin/subscriptions/:id/deactivate` — set the plan's status to
   * `INACTIVE` (T8.2). Idempotent; a `404` for an unknown / cross-tenant id.
   * Returns the updated detail.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingManage)
  async deactivate(@Param('id') id: string): Promise<SetSubscriptionPlanStatusResponse> {
    return this.plans.deactivateSubscriptionPlan(id);
  }

  /**
   * `POST /admin/subscriptions/:id/reactivate` — set the plan's status back to
   * `ACTIVE` (T8.2), the inverse of {@link deactivate}. Idempotent; `404`-on-miss.
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.BillingManage)
  async reactivate(@Param('id') id: string): Promise<SetSubscriptionPlanStatusResponse> {
    return this.plans.reactivateSubscriptionPlan(id);
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring the other controllers so validation errors read
 * identically across the API.
 */
function parse<TSchema extends z.ZodTypeAny>(schema: TSchema, data: unknown): z.infer<TSchema> {
  const result = schema.safeParse(data);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data as z.infer<TSchema>;
}
