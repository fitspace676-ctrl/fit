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
  bulkExportMembersSchema,
  listMembersQuerySchema,
  type BulkExportMembersResponse,
  type GetMemberResponse,
  type ListMembersResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MembersService } from './members.service';

/**
 * Staff-console member management API (`/members`, T4.2).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the capability. All three
 * routes require {@link Permission.MemberRead} — the read roster + detail and the
 * export it feeds (write/deactivate are T4.3). The service runs on the
 * tenant-scoped Prisma client, so no handler ever passes or trusts a `gymId`.
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
