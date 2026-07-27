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
  createPtSessionSchema,
  listAdminPtSessionsQuerySchema,
  type AdminPtSessionsResponse,
  type CreatePtSessionResponse,
  type PtSessionStatusResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { PtSessionsService } from './pt-sessions.service';

/**
 * Staff-console PT-calendar API (`/admin/pt-sessions`).
 *
 * The Classes hub's PT Calendar tab: `GET /admin/pt-sessions` returns a chosen
 * trainer's PT sessions in a date window shaped for the calendar; `POST` schedules
 * one; `POST .../cancel` and `.../complete` move a session's lifecycle. Every route
 * is tenant-scoped staff access — {@link TenantGuard} pins the request to one gym
 * and {@link PermissionsGuard} enforces the capability: the read requires
 * {@link Permission.ClassRead}, the writes {@link Permission.ClassWrite} (the same
 * read/write split as class scheduling). The service runs on the tenant-scoped
 * Prisma client, so no handler passes or trusts a `gymId`.
 */
@Controller('admin/pt-sessions')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminPtSessionsController {
  constructor(private readonly ptSessions: PtSessionsService) {}

  /**
   * `GET /admin/pt-sessions?from=<ISO>&to=<ISO>&trainerId=` — the PT sessions whose
   * `startsAt` falls in `[from, to)`, ordered by start. `trainerId` is optional:
   * omit it for every trainer's sessions (how the PT tab opens), pass one to narrow.
   * The query is validated up front (a non-ISO bound, inverted or over-wide range is
   * a `400` with per-field detail). An empty `sessions` array is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async list(@Query() query: unknown): Promise<AdminPtSessionsResponse> {
    return this.ptSessions.listPtSessions(parse(listAdminPtSessionsQuerySchema, query));
  }

  /**
   * `POST /admin/pt-sessions` — schedule one session: `{ trainerId, classTypeId,
   * startsAt, durationMinutes, notes? }`. `endsAt` is derived server-side. Requires
   * {@link Permission.ClassWrite}. Returns `201` with the created session. Failure
   * modes: `400` (invalid body), `404 TRAINER_NOT_FOUND` / `CLASS_TYPE_NOT_FOUND`
   * (unknown / cross-tenant).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ClassWrite)
  async create(@Body() body: unknown): Promise<CreatePtSessionResponse> {
    return this.ptSessions.createPtSession(parse(createPtSessionSchema, body));
  }

  /**
   * `POST /admin/pt-sessions/:id/cancel` — cancel a scheduled session (status
   * `CANCELED`), keeping the row for history. Requires {@link Permission.ClassWrite}.
   * A `404 PT_SESSION_NOT_FOUND` for an unknown / cross-tenant id.
   */
  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async cancel(@Param('id') id: string): Promise<PtSessionStatusResponse> {
    return this.ptSessions.cancelPtSession(id);
  }

  /**
   * `POST /admin/pt-sessions/:id/complete` — mark a session done (status
   * `COMPLETED`). Requires {@link Permission.ClassWrite}. A `404
   * PT_SESSION_NOT_FOUND` for an unknown / cross-tenant id.
   */
  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async complete(@Param('id') id: string): Promise<PtSessionStatusResponse> {
    return this.ptSessions.completePtSession(id);
  }
}

/** Parse `data` with `schema`, turning a Zod failure into a `400` with per-field detail. */
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
