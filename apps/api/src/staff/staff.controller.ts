import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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
  createStaffSchema,
  inviteStaffSchema,
  listStaffQuerySchema,
  updateStaffProfileSchema,
  updateStaffRoleSchema,
  type InviteStaffResponse,
  type ListStaffResponse,
  type StaffMember,
  type UpdateStaffRoleResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { StaffService } from './staff.service';

/**
 * Staff-console staff management API (`/staff`, T4.7).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the request
 * to one gym and {@link PermissionsGuard} enforces the staff capabilities —
 * {@link Permission.StaffRead} to list, {@link Permission.StaffManage} to change,
 * {@link Permission.StaffAssignRole} to re-role —
 * (held by OWNER + MANAGER, though the admin route is OWNER-gated client-side).
 * The service runs on the tenant-scoped Prisma client, so no handler ever passes
 * or trusts a `gymId`. The `accept-invite` redirect + the redemption that creates
 * the membership live on the public {@link AuthController}, since they must work
 * before the invitee has any session.
 */
@Controller('staff')
@UseGuards(TenantGuard, PermissionsGuard)
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  /**
   * `GET /staff` — the gym's active staff plus its pending invitations. Both
   * collections are small and unpaginated; an empty gym is a normal `200`. The
   * optional `role` / `status` query narrows the staff roster (the staff-list
   * tab's filters).
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffRead)
  async list(@Query() query: unknown): Promise<ListStaffResponse> {
    return this.staff.listStaff(parse(listStaffQuerySchema, query));
  }

  /**
   * `POST /staff` — add a staff member straight to the directory: a login-less
   * record (no invitation email, no password is set). The body is validated with
   * {@link createStaffSchema} — only `firstName` + `role` are required; contact
   * details, specialty tags, assigned locations and a weekly schedule are all
   * optional. Returns the created staff member (`201`).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.StaffManage)
  async create(@Body() body: unknown): Promise<StaffMember> {
    return this.staff.createStaff(parse(createStaffSchema, body));
  }

  /**
   * `POST /staff/invite` — invite someone to the gym's staff. The body is
   * validated up front (`email` + assignable `role`). Returns `201 { inviteId }`,
   * or `409 ALREADY_STAFF` when the address is already a staff member.
   */
  @Post('invite')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.StaffManage)
  async invite(@Body() body: unknown): Promise<InviteStaffResponse> {
    return this.staff.inviteStaff(parse(inviteStaffSchema, body));
  }

  /**
   * `DELETE /staff/invite/:inviteId` — revoke a pending invitation. Idempotent in
   * effect; an unknown / already-used id is a `404 INVITE_NOT_FOUND`. Returns `204`.
   */
  @Delete('invite/:inviteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StaffManage)
  async revokeInvite(@Param('inviteId') inviteId: string): Promise<void> {
    await this.staff.revokeInvite(inviteId);
  }

  /**
   * `PATCH /staff/:memberId/role` — change a staff member's role. Returns the
   * updated staff member (`200`), or `403 LAST_OWNER` when downgrading the gym's
   * only owner. An unknown id is a `404 STAFF_NOT_FOUND`.
   */
  @Patch(':memberId/role')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffAssignRole)
  async updateRole(
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ): Promise<UpdateStaffRoleResponse> {
    return this.staff.updateRole(memberId, parse(updateStaffRoleSchema, body));
  }

  /**
   * `PATCH /staff/:memberId/profile` — edit a directory staff member's profile
   * (name, status, contact details, assigned locations, weekly schedule). A
   * partial update; role changes go through the role route above. Returns the
   * updated staff member (`200`), or `404 STAFF_NOT_FOUND` for an unknown id.
   */
  @Patch(':memberId/profile')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async updateProfile(
    @Param('memberId') memberId: string,
    @Body() body: unknown,
  ): Promise<StaffMember> {
    return this.staff.updateStaffProfile(memberId, parse(updateStaffProfileSchema, body));
  }

  /**
   * `DELETE /staff/:memberId` — remove a staff member, revoking their sessions
   * immediately. Returns `204`, or `403 LAST_OWNER` when removing the gym's only
   * owner. An unknown id is a `404 STAFF_NOT_FOUND`.
   */
  @Delete(':memberId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StaffManage)
  async remove(@Param('memberId') memberId: string): Promise<void> {
    await this.staff.removeStaff(memberId);
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
