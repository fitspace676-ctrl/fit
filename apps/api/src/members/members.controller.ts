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
  createMemberSchema,
  listMembersQuerySchema,
  updateMemberSchema,
  type BulkExportMembersResponse,
  type CreateMemberResponse,
  type GetMemberResponse,
  type ListMembersResponse,
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
