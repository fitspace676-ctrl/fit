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
  createCrmActivitySchema,
  createCrmTaskSchema,
  createLeadSchema,
  createOpportunitySchema,
  listLeadsQuerySchema,
  listOpportunitiesQuerySchema,
  markLostSchema,
  markWonSchema,
  recentCrmActivitiesQuerySchema,
  updateCrmTaskSchema,
  updateLeadSchema,
  updateOpportunitySchema,
  type CreateCrmActivityResponse,
  type CrmForecastResponse,
  type CrmPipelineResponse,
  type CrmTaskResponse,
  type GetLeadResponse,
  type GetOpportunityResponse,
  type ListLeadsResponse,
  type ListOpportunitiesResponse,
  type RecentCrmActivitiesResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { CrmService } from './crm.service';

/**
 * Staff-console CRM API (`/crm`, T12.2) — leads, opportunities, activities,
 * tasks, and the pipeline/forecast aggregations behind the Growth area's CRM
 * module (T12.1).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the
 * request to one gym and {@link PermissionsGuard} enforces the capability —
 * reads require {@link Permission.CrmRead}, writes
 * {@link Permission.CrmManage}. The service runs on the tenant-scoped Prisma
 * client, so no handler ever passes or trusts a `gymId`.
 */
@Controller('crm')
@UseGuards(TenantGuard, PermissionsGuard)
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  // -------------------------------------------------------------------------
  // Leads
  // -------------------------------------------------------------------------

  /**
   * `GET /crm/leads?page&limit&search&status&source&assignedToId&locationId&sort&dir`
   * — one filtered, server-paginated page of the gym's leads plus per-status
   * tab counts. A malformed query is a `400` with per-field detail.
   */
  @Get('leads')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmRead)
  async listLeads(@Query() query: unknown): Promise<ListLeadsResponse> {
    return this.crm.listLeads(parse(listLeadsQuerySchema, query));
  }

  /**
   * `GET /crm/leads/:id` — one lead's detail (row + activity timeline +
   * tasks). An unknown or cross-tenant id is a `404 LEAD_NOT_FOUND`.
   */
  @Get('leads/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmRead)
  async getLead(@Param('id') id: string): Promise<GetLeadResponse> {
    return this.crm.getLead(id);
  }

  /**
   * `POST /crm/leads` — capture a lead (status starts `NEW`). An assignee or
   * branch that isn't the gym's is a `400`. Returns `201` with the detail.
   */
  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CrmManage)
  async createLead(@Body() body: unknown): Promise<GetLeadResponse> {
    return this.crm.createLead(parse(createLeadSchema, body));
  }

  /**
   * `PATCH /crm/leads/:id` — edit a lead / move it between open stages.
   * Closing goes through `/convert` / `/lose` so the reason is captured.
   */
  @Patch('leads/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmManage)
  async updateLead(@Param('id') id: string, @Body() body: unknown): Promise<GetLeadResponse> {
    return this.crm.updateLead(id, parse(updateLeadSchema, body));
  }

  /**
   * `POST /crm/leads/:id/convert` — close the lead as `CONVERTED`, persisting
   * the optional win reason (and clearing any stale loss reason).
   */
  @Post('leads/:id/convert')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmManage)
  async convertLead(@Param('id') id: string, @Body() body: unknown): Promise<GetLeadResponse> {
    return this.crm.convertLead(id, parse(markWonSchema, body ?? {}));
  }

  /**
   * `POST /crm/leads/:id/lose` — close the lead as `LOST`. The reason is
   * required: a loss must say why.
   */
  @Post('leads/:id/lose')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmManage)
  async loseLead(@Param('id') id: string, @Body() body: unknown): Promise<GetLeadResponse> {
    return this.crm.loseLead(id, parse(markLostSchema, body));
  }

  /** `DELETE /crm/leads/:id` — delete a lead and its timeline. Returns `204`. */
  @Delete('leads/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.CrmManage)
  async deleteLead(@Param('id') id: string): Promise<void> {
    await this.crm.deleteLead(id);
  }

  // -------------------------------------------------------------------------
  // Opportunities
  // -------------------------------------------------------------------------

  /**
   * `GET /crm/opportunities?page&limit&search&status&type&assignedToId&memberId&sort&dir`
   * — one filtered page of upsell opportunities plus per-status kanban counts.
   */
  @Get('opportunities')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmRead)
  async listOpportunities(@Query() query: unknown): Promise<ListOpportunitiesResponse> {
    return this.crm.listOpportunities(parse(listOpportunitiesQuerySchema, query));
  }

  /**
   * `GET /crm/opportunities/:id` — one opportunity's detail. An unknown or
   * cross-tenant id is a `404 OPPORTUNITY_NOT_FOUND`.
   */
  @Get('opportunities/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmRead)
  async getOpportunity(@Param('id') id: string): Promise<GetOpportunityResponse> {
    return this.crm.getOpportunity(id);
  }

  /**
   * `POST /crm/opportunities` — open an opportunity on an existing member
   * (status starts `INTERESTED`). An unknown / cross-tenant `memberId` is a
   * `404 MEMBER_NOT_FOUND`. Returns `201` with the detail.
   */
  @Post('opportunities')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CrmManage)
  async createOpportunity(@Body() body: unknown): Promise<GetOpportunityResponse> {
    return this.crm.createOpportunity(parse(createOpportunitySchema, body));
  }

  /**
   * `PATCH /crm/opportunities/:id` — edit an opportunity / move it between
   * open stages. Closing goes through `/won` / `/lost`.
   */
  @Patch('opportunities/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmManage)
  async updateOpportunity(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetOpportunityResponse> {
    return this.crm.updateOpportunity(id, parse(updateOpportunitySchema, body));
  }

  /**
   * `POST /crm/opportunities/:id/won` — close as `WON`, persisting the
   * optional win reason.
   */
  @Post('opportunities/:id/won')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmManage)
  async winOpportunity(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetOpportunityResponse> {
    return this.crm.winOpportunity(id, parse(markWonSchema, body ?? {}));
  }

  /**
   * `POST /crm/opportunities/:id/lost` — close as `LOST` with a required
   * reason.
   */
  @Post('opportunities/:id/lost')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmManage)
  async loseOpportunity(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetOpportunityResponse> {
    return this.crm.loseOpportunity(id, parse(markLostSchema, body));
  }

  /** `DELETE /crm/opportunities/:id` — delete an opportunity. Returns `204`. */
  @Delete('opportunities/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.CrmManage)
  async deleteOpportunity(@Param('id') id: string): Promise<void> {
    await this.crm.deleteOpportunity(id);
  }

  // -------------------------------------------------------------------------
  // Activities & tasks
  // -------------------------------------------------------------------------

  /**
   * `GET /crm/activities/recent?limit` — the gym's newest touchpoints across
   * every lead + opportunity, each resolved to what it was logged against.
   */
  @Get('activities/recent')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmRead)
  async recentActivities(@Query() query: unknown): Promise<RecentCrmActivitiesResponse> {
    return this.crm.recentActivities(parse(recentCrmActivitiesQuerySchema, query));
  }

  /**
   * `POST /crm/activities` — log a touchpoint against exactly one of a lead /
   * an opportunity. The acting staff member comes from the session. `404`s a
   * bad parent; returns `201` with the stored entry.
   */
  @Post('activities')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CrmManage)
  async logActivity(@Body() body: unknown): Promise<CreateCrmActivityResponse> {
    return this.crm.logActivity(parse(createCrmActivitySchema, body));
  }

  /**
   * `POST /crm/tasks` — log a follow-up to-do against exactly one of a lead /
   * an opportunity. `404`s a bad parent; returns `201` with the stored task.
   */
  @Post('tasks')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.CrmManage)
  async createTask(@Body() body: unknown): Promise<CrmTaskResponse> {
    return this.crm.createTask(parse(createCrmTaskSchema, body));
  }

  /**
   * `PATCH /crm/tasks/:id` — edit / complete a task. Completing it also logs a
   * `TASK_COMPLETED` activity on the task's parent. `404`s an unknown id.
   */
  @Patch('tasks/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmManage)
  async updateTask(@Param('id') id: string, @Body() body: unknown): Promise<CrmTaskResponse> {
    return this.crm.updateTask(id, parse(updateCrmTaskSchema, body));
  }

  /** `DELETE /crm/tasks/:id` — delete a task. Returns `204`; `404`s a miss. */
  @Delete('tasks/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.CrmManage)
  async deleteTask(@Param('id') id: string): Promise<void> {
    await this.crm.deleteTask(id);
  }

  // -------------------------------------------------------------------------
  // Aggregations
  // -------------------------------------------------------------------------

  /**
   * `GET /crm/pipeline` — the combined funnel: per-open-stage count / value /
   * probability-weighted value plus totals and the closed-record win rate.
   */
  @Get('pipeline')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmRead)
  async pipeline(): Promise<CrmPipelineResponse> {
    return this.crm.pipeline();
  }

  /**
   * `GET /crm/forecast` — expected (probability-weighted) and potential
   * revenue of every open deal, bucketed by expected-close month.
   */
  @Get('forecast')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.CrmRead)
  async forecast(): Promise<CrmForecastResponse> {
    return this.crm.forecast();
  }
}

/**
 * Parse `data` with `schema`, raising a `400` whose body lists each failing
 * field as `path: message` — mirroring the other controllers so validation
 * errors read identically across the API.
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
