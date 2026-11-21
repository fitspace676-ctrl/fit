import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  bookServiceSessionForMemberSchema,
  createServiceSessionSchema,
  listAdminServiceSessionsQuerySchema,
  listServiceSlotsQuerySchema,
  type AdminServiceSession,
  type AdminServiceSessionsResponse,
  type BookServiceSessionResult,
  type ListMemberServiceSessionsResponse,
  type ListServiceSlotsResponse,
  type ListAdminOwnServicesResponse,
} from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { PortalBranchService } from '../common/portal-branch.service';
import {
  RequireAnyPermissions,
  RequirePermissions,
} from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ServiceSessionsService } from './service-sessions.service';

/** Staff side: the PT calendar's slots. */
@Controller('admin/service-sessions')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminServiceSessionsController {
  constructor(private readonly sessions: ServiceSessionsService) {}

  /** `GET /admin/service-sessions?from&to&staffId?&serviceId?` — the calendar feed. */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.PtSessionRead)
  async list(@Query() query: unknown): Promise<AdminServiceSessionsResponse> {
    return this.sessions.list(parse(listAdminServiceSessionsQuerySchema, query));
  }

  /**
   * `GET /admin/service-sessions/own-services` — the caller's own ACTIVE services,
   * for the "Open a slot" picker of a coach who may only open their own.
   */
  @Get('own-services')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermissions(Permission.PtSessionManage, Permission.PtSessionManageOwn)
  async ownServices(): Promise<ListAdminOwnServicesResponse> {
    return this.sessions.listOwnServices();
  }

  /**
   * `POST /admin/service-sessions` — open one slot: `{ serviceId, startsAt, notes? }`.
   * `PtSessionManage` opens any service's slot; `PtSessionManageOwn` only the caller's
   * own services (checked in the service, `403 NOT_YOUR_SERVICE` otherwise).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequireAnyPermissions(Permission.PtSessionManage, Permission.PtSessionManageOwn)
  async create(@Body() body: unknown): Promise<AdminServiceSession> {
    return this.sessions.create(parse(createServiceSessionSchema, body));
  }

  /**
   * `POST /admin/service-sessions/:id/book` — book an open slot for a member:
   * `{ memberId }`. Book / cancel / complete admit `PtSessionManageOwn` on the
   * caller's own slots (checked in the service, `403 NOT_YOUR_SERVICE` otherwise).
   */
  @Post(':id/book')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermissions(Permission.PtSessionManage, Permission.PtSessionManageOwn)
  async bookFor(@Param('id') id: string, @Body() body: unknown): Promise<AdminServiceSession> {
    const { memberId } = parse(bookServiceSessionForMemberSchema, body);
    return this.sessions.bookFor(id, memberId);
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermissions(Permission.PtSessionManage, Permission.PtSessionManageOwn)
  async cancel(@Param('id') id: string): Promise<AdminServiceSession> {
    return this.sessions.cancel(id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequireAnyPermissions(Permission.PtSessionManage, Permission.PtSessionManageOwn)
  async complete(@Param('id') id: string): Promise<AdminServiceSession> {
    return this.sessions.complete(id);
  }
}

/**
 * Public side: the OPEN slots a visitor sees on the portal's service page.
 * `@Public()` and excluded from the JWT `TenantMiddleware` (like `/services`);
 * the gym is the explicit `gymId` query param. The branch is the explicit
 * `locationId`, else a signed-in member's home branch, else every branch
 * ({@link PortalBranchService}).
 */
@Controller('service-sessions')
export class ServiceSlotsController {
  constructor(
    private readonly sessions: ServiceSessionsService,
    private readonly portalBranch: PortalBranchService,
  ) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(
    @Query() query: unknown,
    @Headers('authorization') authorization?: string,
  ): Promise<ListServiceSlotsResponse> {
    const parsed = parse(listServiceSlotsQuerySchema, query);
    const locationId = await this.portalBranch.resolve({ ...parsed, authorization });
    return this.sessions.listOpenSlots({ ...parsed, locationId });
  }
}

/** Member side: book a slot, see one's own sessions. */
@Controller('me/service-sessions')
@UseGuards(TenantGuard, PermissionsGuard)
export class MeServiceSessionsController {
  constructor(private readonly sessions: ServiceSessionsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassBook)
  async list(): Promise<ListMemberServiceSessionsResponse> {
    return this.sessions.listMine();
  }

  /** `POST /me/service-sessions/:id/book` — claim an OPEN slot; raises a PENDING invoice. */
  @Post(':id/book')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassBook)
  async book(@Param('id') id: string): Promise<BookServiceSessionResult> {
    return this.sessions.book(id);
  }
}

function parse<T>(schema: z.ZodType<T, z.ZodTypeDef, unknown>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestException(
      result.error.issues.map((issue) => {
        const path = issue.path.join('.');
        return path ? `${path}: ${issue.message}` : issue.message;
      }),
    );
  }
  return result.data;
}
