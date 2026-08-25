import {
  BadRequestException,
  Body,
  Controller,
  Get,
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
  createServiceSessionSchema,
  listAdminServiceSessionsQuerySchema,
  listServiceSlotsQuerySchema,
  type AdminServiceSession,
  type AdminServiceSessionsResponse,
  type BookServiceSessionResult,
  type ListMemberServiceSessionsResponse,
  type ListServiceSlotsResponse,
} from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
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
  @RequirePermissions(Permission.ClassRead)
  async list(@Query() query: unknown): Promise<AdminServiceSessionsResponse> {
    return this.sessions.list(parse(listAdminServiceSessionsQuerySchema, query));
  }

  /** `POST /admin/service-sessions` — open one slot: `{ serviceId, startsAt, notes? }`. */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ClassWrite)
  async create(@Body() body: unknown): Promise<AdminServiceSession> {
    return this.sessions.create(parse(createServiceSessionSchema, body));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async cancel(@Param('id') id: string): Promise<AdminServiceSession> {
    return this.sessions.cancel(id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async complete(@Param('id') id: string): Promise<AdminServiceSession> {
    return this.sessions.complete(id);
  }
}

/**
 * Public side: the OPEN slots a visitor sees on the portal's service page.
 * `@Public()` and excluded from the JWT `TenantMiddleware` (like `/services`);
 * the gym is the explicit `gymId` query param.
 */
@Controller('service-sessions')
export class ServiceSlotsController {
  constructor(private readonly sessions: ServiceSessionsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(@Query() query: unknown): Promise<ListServiceSlotsResponse> {
    return this.sessions.listOpenSlots(parse(listServiceSlotsQuerySchema, query));
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
