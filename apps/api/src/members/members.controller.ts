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
  bulkExportMembersSchema,
  createMemberNoteSchema,
  createMemberSchema,
  createMemberTaskSchema,
  listMembersQuerySchema,
  sendMemberEmailSchema,
  updateMemberSchema,
  updateMemberTaskSchema,
  type BulkExportMembersResponse,
  type CreateMemberResponse,
  type GetMemberResponse,
  type ListMembersResponse,
  type SendMemberEmailResponse,
  setMemberKindSchema,
  type SetMemberStatusResponse,
  type UpdateMemberResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MembersService } from './members.service';

/**
 * Staff-console member management API (`/members`, T4.2).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability. Reads (roster,
 * detail, and the export they feed) require {@link Permission.MemberRead}; the
 * writes — create, edit, and deactivate/reactivate (T4.3) — require
 * {@link Permission.MemberWrite}. The service runs on the tenant-scoped Prisma
 * client, so no handler ever passes or trusts a `gymId`.
 */
@Controller('members')
@UseGuards(TenantGuard, PermissionsGuard)
export class MembersController {
  constructor(private readonly members: MembersService) {}

  /**
   * `GET /members?page&limit&search&status&planId&sort&dir` — one filtered,
   * server-paginated page of the gym's members. The query is validated up front
   * (a bad page/limit/status is a `400` with per-field detail) so the service
   * only sees a well-formed, defaulted request. An empty page is a normal `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberRead)
  async list(@Query() query: unknown): Promise<ListMembersResponse> {
    return this.members.listMembers(parse(listMembersQuerySchema, query));
  }

  /**
   * `GET /members/:id` — one member's detail (overview + history tabs). An
   * unknown or cross-tenant id is a `404 MEMBER_NOT_FOUND` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberRead)
  async getOne(@Param('id') id: string): Promise<GetMemberResponse> {
    return this.members.getMember(id);
  }

  /**
   * `POST /members/bulk-export` — enqueue an async CSV export of the selected
   * members (or the current filtered view). Returns `202 Accepted` with the
   * `jobId` the client polls for the streamed file.
   */
  @Post('bulk-export')
  @HttpCode(HttpStatus.ACCEPTED)
  @RequirePermissions(Permission.MemberRead)
  async bulkExport(@Body() body: unknown): Promise<BulkExportMembersResponse> {
    return this.members.bulkExport(parse(bulkExportMembersSchema, body));
  }

  /**
   * `POST /members` — create a member (T4.3). The body is validated up front
   * (`name` + `email` required, `phone` optional, `status` defaults to `ACTIVE`).
   * A person who already exists by email is linked to the gym; an email already
   * a member of *this* gym is a `409 MEMBER_EXISTS`. Returns `201` with the detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MemberWrite)
  async create(@Body() body: unknown): Promise<CreateMemberResponse> {
    return this.members.createMember(parse(createMemberSchema, body));
  }

  /**
   * `PATCH /members/:id` — edit a member's profile (`name` / `phone`, T4.3). An
   * unknown or cross-tenant id is a `404 MEMBER_NOT_FOUND`. Returns the updated
   * detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async update(@Param('id') id: string, @Body() body: unknown): Promise<UpdateMemberResponse> {
    return this.members.updateMember(id, parse(updateMemberSchema, body));
  }

  /**
   * `POST /members/:id/deactivate` — set the member's status to `SUSPENDED`
   * (T4.3). Idempotent; a `404` for an unknown / cross-tenant id. Returns the
   * updated detail.
   */
  @Post(':id/deactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async deactivate(@Param('id') id: string): Promise<SetMemberStatusResponse> {
    return this.members.deactivateMember(id);
  }

  /**
   * `POST /members/:id/reactivate` — set the member's status back to `ACTIVE`
   * (T4.3), the inverse of {@link deactivate}. Idempotent; `404`-on-miss.
   */
  @Post(':id/reactivate')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async reactivate(@Param('id') id: string): Promise<SetMemberStatusResponse> {
    return this.members.reactivateMember(id);
  }

  /**
   * `PATCH /members/:id/kind` — pin this person's standing (member / guest /
   * lapsed), or send `{ kind: null }` to clear the pin and let it follow their
   * subscriptions again. Requires `MemberWrite`; `404` on an unknown id.
   */
  @Patch(':id/kind')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async setKind(@Param('id') id: string, @Body() body: unknown): Promise<SetMemberStatusResponse> {
    return this.members.setMemberKind(id, parse(setMemberKindSchema, body).kind);
  }

  /**
   * `POST /members/:id/trash` — move a member to trash (soft-delete). The member
   * drops out of the roster and every live count but is recoverable via
   * {@link restore} until the purge cron permanently deletes it after the 30-day
   * retention window. A `404` for an unknown / cross-tenant / already-trashed id.
   * Returns the trashed member's detail.
   */
  @Post(':id/trash')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async trash(@Param('id') id: string): Promise<SetMemberStatusResponse> {
    return this.members.softDeleteMember(id);
  }

  /**
   * `POST /members/:id/restore` — restore a trashed member (the inverse of
   * {@link trash}), returning them to the live roster with their prior status. A
   * `404` for a live / unknown / cross-tenant id. Returns the restored detail.
   */
  @Post(':id/restore')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async restore(@Param('id') id: string): Promise<SetMemberStatusResponse> {
    return this.members.restoreMember(id);
  }

  /**
   * `POST /members/:id/notes` — add a staff note to a member (T4.x). The author is
   * resolved from the session server-side. `404`s an unknown / cross-tenant id.
   * Returns the fresh member detail.
   */
  @Post(':id/notes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MemberWrite)
  async addNote(@Param('id') id: string, @Body() body: unknown): Promise<GetMemberResponse> {
    return this.members.addNote(id, parse(createMemberNoteSchema, body));
  }

  /**
   * `POST /members/:id/email` — send a one-off staff email to the member. Validates
   * `{ subject, body }`, `404`s an unknown / cross-tenant / trashed id, and `503`s
   * (`EMAIL_NOT_CONFIGURED`) when outbound mail is disabled. Returns `{ sent }`.
   */
  @Post(':id/email')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async sendEmail(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<SendMemberEmailResponse> {
    return this.members.sendMemberEmail(id, parse(sendMemberEmailSchema, body));
  }

  /**
   * `POST /members/:id/tasks` — log a follow-up task against a member (T4.x).
   * `404`s an unknown / cross-tenant id. Returns the fresh member detail.
   */
  @Post(':id/tasks')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.MemberWrite)
  async addTask(@Param('id') id: string, @Body() body: unknown): Promise<GetMemberResponse> {
    return this.members.addTask(id, parse(createMemberTaskSchema, body));
  }

  /**
   * `PATCH /members/:id/tasks/:taskId` — flip a member task between pending and
   * done (T4.x). `404`s an unknown member or task. Returns the fresh member detail.
   */
  @Patch(':id/tasks/:taskId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.MemberWrite)
  async setTaskStatus(
    @Param('id') id: string,
    @Param('taskId') taskId: string,
    @Body() body: unknown,
  ): Promise<GetMemberResponse> {
    return this.members.setTaskStatus(id, taskId, parse(updateMemberTaskSchema, body));
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
