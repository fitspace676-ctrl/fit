import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  upsertAgentSessionSchema,
  type AgentSessionDetail,
  type ListAgentSessionsResponse,
  type UpsertAgentSessionResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AgentSessionsService } from './agent-sessions.service';

/**
 * Admin console AI-agent chat session persistence (`/agent/sessions`, T12.22).
 *
 * These are a staff member's own chat sessions — moved server-side out of
 * `localStorage` — so there is no gym-wide "manage" capability to gate on;
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * is satisfied with {@link Permission.ProfileManage}, the one permission every
 * gym-scoped role holds (mirroring the self-service `/me/*` routes). The
 * service further scopes every read/write to the caller's own `userId`, so one
 * staff member never sees another's sessions even within the same gym.
 */
@Controller('agent/sessions')
@UseGuards(TenantGuard, PermissionsGuard)
export class AgentSessionsController {
  constructor(private readonly sessions: AgentSessionsService) {}

  /** `GET /agent/sessions` — the caller's sessions, newest first (metadata only). */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async list(): Promise<ListAgentSessionsResponse> {
    return this.sessions.list();
  }

  /** `GET /agent/sessions/:id` — one session with its full transcript. */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async get(@Param('id') id: string): Promise<AgentSessionDetail> {
    return this.sessions.get(id);
  }

  /**
   * `PUT /agent/sessions/:id` — upsert a session's title + transcript. The
   * client mints `id`; an unknown one is created, an existing one overwritten.
   */
  @Put(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async upsert(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UpsertAgentSessionResponse> {
    return this.sessions.upsert(id, parse(upsertAgentSessionSchema, body));
  }

  /** `DELETE /agent/sessions/:id` — remove one of the caller's sessions (idempotent). */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.ProfileManage)
  async remove(@Param('id') id: string): Promise<void> {
    await this.sessions.remove(id);
  }
}

/** Validate `data` against `schema`, raising a `400` with per-field detail on failure. */
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
