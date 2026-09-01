import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  recordCheckInSchema,
  type CheckInStatsResponse,
  type MemberEligibility,
  type RecordCheckInResponse,
  type TodayCheckInsResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { RateLimit, RATE_LIMITS } from '../common/rate-limit/rate-limit.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CheckInService } from './check-in.service';

/** Query for `GET /admin/check-ins/eligibility` — the member to look up. */
const eligibilityQuerySchema = z.object({ gymMemberId: z.string().min(1) });

/**
 * Staff-console reception (check-in) API (`/admin/check-ins`, T4.12).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability. Reads (today's
 * arrivals, the stats snapshot, a member's eligibility) require
 * {@link Permission.MemberCheckinRead}; recording an arrival requires
 * {@link Permission.MemberWrite} — the same capabilities the member roster gates
 * on, both held by the `RECEPTIONIST` role that mans the desk. The service runs on
 * the tenant-scoped Prisma client, so no handler ever passes or trusts a `gymId`.
 */
@Controller('admin/check-ins')
@UseGuards(TenantGuard, PermissionsGuard)
export class CheckInController {
  constructor(private readonly checkIns: CheckInService) {}

  /**
   * `POST /admin/check-ins` — record a member's arrival. The body is validated up
   * front (`gymMemberId` required, `method` defaults to `MANUAL`); an unknown or
   * cross-tenant member id is a `404 MEMBER_NOT_FOUND`. Returns `201` with the
   * created row + the member's eligibility at check-in time.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MemberWrite)
  @RateLimit(RATE_LIMITS.checkIn)
  async record(@Body() body: unknown): Promise<RecordCheckInResponse> {
    return this.checkIns.recordCheckIn(parse(recordCheckInSchema, body));
  }

  /**
   * `GET /admin/check-ins/today` — today's arrivals, most recent first (the live
   * reception feed). Takes no query: it is always the caller's own gym. An empty
   * day is a normal `200`.
   */
  @Get('today')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberCheckinRead)
  async today(): Promise<TodayCheckInsResponse> {
    return this.checkIns.listToday();
  }

  /**
   * `GET /admin/check-ins/stats` — the reception KPI snapshot (checked-in today,
   * in-gym now, peak today, no-shows). Takes no query: always the caller's gym.
   */
  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberCheckinRead)
  async stats(): Promise<CheckInStatsResponse> {
    return this.checkIns.getStats();
  }

  /**
   * `GET /admin/check-ins/eligibility?gymMemberId=` — one member's current access
   * standing + plan for the manual-lookup card. An unknown or cross-tenant id is a
   * `404 MEMBER_NOT_FOUND`.
   */
  @Get('eligibility')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberCheckinRead)
  async eligibility(@Query() query: unknown): Promise<MemberEligibility> {
    return this.checkIns.getEligibility(parse(eligibilityQuerySchema, query).gymMemberId);
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
