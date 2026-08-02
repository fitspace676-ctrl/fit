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
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  createStaffNoteSchema,
  createStaffTaskSchema,
  createTimeOffRequestSchema,
  decideTimeOffRequestSchema,
  listTimeOffQuerySchema,
  updateStaffScheduleSchema,
  updateStaffTaskSchema,
  type ListStaffNotesResponse,
  type ListStaffRolesResponse,
  type ListStaffTasksResponse,
  type ListTimeOffResponse,
  type StaffNoteRow,
  type StaffScheduleResponse,
  type StaffTaskRow,
  type TimeOffRequestRow,
  type WorkingNowResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { StaffDepthService } from './staff-depth.service';

/**
 * Staff-console "depth" API (`/staff`, T12.14) — the per-staff Notes / Tasks /
 * Time-off / Weekly-schedule tabs, the gym-wide time-off approval queue, and the
 * read-only Roles & Permissions matrix. A second controller on the `/staff`
 * prefix alongside {@link StaffController} (the roster + invites); its routes
 * never collide since each uses a distinct static segment
 * (`roles` / `notes` / `tasks` / `time-off`) or the two-segment
 * `:staffId/<tab>` shape.
 *
 * Every route is tenant-scoped and gated on {@link Permission.StaffManage}
 * (OWNER + MANAGER), matching the rest of staff management. The service runs on
 * the tenant-scoped Prisma client, so no handler passes or trusts a `gymId`.
 */
@Controller('staff')
@UseGuards(TenantGuard, PermissionsGuard)
export class StaffDepthController {
  constructor(private readonly staff: StaffDepthService) {}

  /** `GET /staff/roles` — the read-only roles/permissions matrix. */
  @Get('roles')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  listRoles(): ListStaffRolesResponse {
    return this.staff.listRoles();
  }

  // -- Notes ----------------------------------------------------------------

  @Get(':staffId/notes')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async listNotes(@Param('staffId') staffId: string): Promise<ListStaffNotesResponse> {
    return this.staff.listNotes(staffId);
  }

  @Post(':staffId/notes')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.StaffManage)
  async addNote(@Param('staffId') staffId: string, @Body() body: unknown): Promise<StaffNoteRow> {
    return this.staff.addNote(staffId, parse(createStaffNoteSchema, body));
  }

  @Delete('notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StaffManage)
  async deleteNote(@Param('noteId') noteId: string): Promise<void> {
    await this.staff.deleteNote(noteId);
  }

  // -- Tasks ----------------------------------------------------------------

  @Get(':staffId/tasks')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async listTasks(@Param('staffId') staffId: string): Promise<ListStaffTasksResponse> {
    return this.staff.listTasks(staffId);
  }

  @Post(':staffId/tasks')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.StaffManage)
  async addTask(@Param('staffId') staffId: string, @Body() body: unknown): Promise<StaffTaskRow> {
    return this.staff.addTask(staffId, parse(createStaffTaskSchema, body));
  }

  @Patch('tasks/:taskId')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async updateTask(@Param('taskId') taskId: string, @Body() body: unknown): Promise<StaffTaskRow> {
    return this.staff.updateTask(taskId, parse(updateStaffTaskSchema, body));
  }

  @Delete('tasks/:taskId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StaffManage)
  async deleteTask(@Param('taskId') taskId: string): Promise<void> {
    await this.staff.deleteTask(taskId);
  }

  // -- Time off -------------------------------------------------------------

  @Get('time-off')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async listTimeOff(@Query() query: unknown): Promise<ListTimeOffResponse> {
    return this.staff.listTimeOff(parse(listTimeOffQuerySchema, query));
  }

  @Get(':staffId/time-off')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async listStaffTimeOff(@Param('staffId') staffId: string): Promise<ListTimeOffResponse> {
    return this.staff.listStaffTimeOff(staffId);
  }

  @Post(':staffId/time-off')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.StaffManage)
  async createTimeOff(
    @Param('staffId') staffId: string,
    @Body() body: unknown,
  ): Promise<TimeOffRequestRow> {
    return this.staff.createTimeOff(staffId, parse(createTimeOffRequestSchema, body));
  }

  @Patch('time-off/:requestId/decision')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async decideTimeOff(
    @Param('requestId') requestId: string,
    @Body() body: unknown,
  ): Promise<TimeOffRequestRow> {
    return this.staff.decideTimeOff(requestId, parse(decideTimeOffRequestSchema, body));
  }

  @Delete('time-off/:requestId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.StaffManage)
  async deleteTimeOff(@Param('requestId') requestId: string): Promise<void> {
    await this.staff.deleteTimeOff(requestId);
  }

  // -- Weekly schedule ------------------------------------------------------

  @Get(':staffId/schedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async getSchedule(@Param('staffId') staffId: string): Promise<StaffScheduleResponse> {
    return this.staff.getSchedule(staffId);
  }

  @Put(':staffId/schedule')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async updateSchedule(
    @Param('staffId') staffId: string,
    @Body() body: unknown,
  ): Promise<StaffScheduleResponse> {
    return this.staff.updateSchedule(staffId, parse(updateStaffScheduleSchema, body));
  }

  // -- Working now ----------------------------------------------------------

  /**
   * `GET /staff/working-now` — the gym's staff on shift at this moment, behind
   * the "Who's Working Now" card. A static segment, so it never collides with
   * the `:staffId/schedule` route above.
   */
  @Get('working-now')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.StaffManage)
  async getWorkingNow(): Promise<WorkingNowResponse> {
    return this.staff.getWorkingNow();
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing field
 * as `path: message` — mirroring {@link StaffController} so validation errors read
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
