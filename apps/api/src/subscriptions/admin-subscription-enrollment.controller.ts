import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  adminEnrollSubscriptionSchema,
  type EnrollSubscriptionResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { SubscriptionEnrollmentService } from './subscription-enrollment.service';

/**
 * Staff-console member-enrolment API (`POST /admin/subscriptions/enroll`, T5.3).
 *
 * Sits under `/admin/subscriptions` alongside the plan CRUD
 * ({@link AdminSubscriptionPlansController}, T8.2) but is a distinct capability:
 * this enrols a *member* on a plan (creating a {@link Subscription}), whereas the
 * plan CRUD manages the catalogue. It is a staff write, so it is gated by
 * {@link Permission.BillingManage} (which covers "subscriptions, plans, and payment
 * settings") behind {@link TenantGuard} + the global {@link PermissionsGuard}. The
 * member self-checkout counterpart is `POST /subscriptions`
 * ({@link SubscriptionsController}, `SubscriptionManage`); both delegate to the one
 * {@link SubscriptionEnrollmentService} so the enrolment invariants live in a single
 * place.
 */
@Controller('admin/subscriptions')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminSubscriptionEnrollmentController {
  constructor(private readonly enrollment: SubscriptionEnrollmentService) {}

  /**
   * `POST /admin/subscriptions/enroll` — enrol `memberId` on `planId`. Both are
   * validated to belong to the caller's gym. Returns `201 { subscription }`.
   * Failure modes: `404 MEMBER_NOT_FOUND`, `404 SUBSCRIPTION_PLAN_NOT_FOUND`, `409
   * SUBSCRIPTION_PLAN_INACTIVE`, and `409 ALREADY_SUBSCRIBED`.
   */
  @Post('enroll')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.BillingManage)
  async enroll(@Body() body: unknown): Promise<EnrollSubscriptionResponse> {
    const input = parse(adminEnrollSubscriptionSchema, body);
    return this.enrollment.enrollMember(input.memberId, input.planId);
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
