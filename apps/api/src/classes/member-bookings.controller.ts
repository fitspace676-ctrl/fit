import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  listMemberBookingsQuerySchema,
  type ListMemberBookingsResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MemberBookingsService } from './member-bookings.service';

/**
 * Member-panel booking-history endpoint (`GET /me/bookings`, T5.10).
 *
 * The member's own bookings across their whole lifecycle — distinct from the
 * per-occurrence booking action ({@link BookingsController}, same `class-
 * instances/:id/bookings` prefix) and the staff attendance roster
 * ({@link AttendanceController}, `admin/class-instances/:id/attendance`). The
 * `/me` prefix makes it self-service: the caller reads *their own* bookings,
 * resolved from the session — there is no member id on the wire. It sits behind
 * {@link TenantGuard} + the global {@link PermissionsGuard} and reuses
 * {@link Permission.ClassBook} (granted to `MEMBER`) — the same capability that
 * gates booking and cancelling, since this is a member managing their own
 * booking lifecycle. The service runs on the tenant-scoped Prisma client, so no
 * handler passes a `gymId`.
 */
@Controller('me/bookings')
@UseGuards(TenantGuard, PermissionsGuard)
export class MemberBookingsController {
  constructor(private readonly bookings: MemberBookingsService) {}

  /**
   * `GET /me/bookings?scope=upcoming|past|all` — the calling member's bookings.
   * The optional `scope` is validated up front (an unknown value is a `400`) and
   * defaults to `all`; the result is ordered by the occurrence's start
   * (ascending for `upcoming`, descending otherwise). An empty list is a normal
   * `200` — a member who has never booked. A caller who is not a member of the
   * gym is a `403`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassBook)
  async list(@Query() query: unknown): Promise<ListMemberBookingsResponse> {
    const result = listMemberBookingsQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(formatIssues(result.error));
    }
    return this.bookings.list(result.data);
  }
}

/** Flatten Zod issues to `field: message` strings for a `400` body. */
function formatIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const path = issue.path.join('.');
    return path ? `${path}: ${issue.message}` : issue.message;
  });
}
