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
  createAutomationRuleSchema,
  listAutomationRulesQuerySchema,
  listAutomationRunsQuerySchema,
  saveAsTemplateSchema,
  toggleAutomationRuleSchema,
  updateAutomationRuleSchema,
  type AutomationCatalogResponse,
  type GetAutomationRuleResponse,
  type ListAutomationRulesResponse,
  type ListAutomationRunsResponse,
  type ListAutomationTemplatesResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AutomationService } from './automation.service';

/**
 * Staff-console Automation API (`/automation`, T12.5) — the "when X happens, do
 * Y" rules, their reusable templates, the builder's trigger/action catalog, and
 * the executor's run log behind the Growth area's Automation module (T12.1).
 *
 * Every route is tenant-scoped staff access: {@link TenantGuard} pins the
 * request to one gym and {@link PermissionsGuard} enforces the capability —
 * reads require {@link Permission.AutomationRead}, writes
 * {@link Permission.AutomationManage}. The service runs on the tenant-scoped
 * Prisma client, so no handler ever passes or trusts a `gymId`.
 */
@Controller('automation')
@UseGuards(TenantGuard, PermissionsGuard)
export class AutomationController {
  constructor(private readonly automation: AutomationService) {}

  /**
   * `GET /automation/catalog` — the trigger / action / timing catalogs the
   * builder renders its pickers from, served from the shared `@fit/types` source.
   */
  @Get('catalog')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AutomationRead)
  catalog(): AutomationCatalogResponse {
    return this.automation.catalog();
  }

  // -------------------------------------------------------------------------
  // Templates
  // -------------------------------------------------------------------------

  /**
   * `GET /automation/templates` — every reusable template (newest first) the
   * builder can clone into a fresh rule.
   */
  @Get('templates')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AutomationRead)
  async listTemplates(): Promise<ListAutomationTemplatesResponse> {
    return this.automation.listTemplates();
  }

  // -------------------------------------------------------------------------
  // Rules
  // -------------------------------------------------------------------------

  /**
   * `GET /automation/rules?page&limit&search&triggerType&active&sort&dir` — one
   * filtered, server-paginated page of the gym's active (non-template) rules.
   */
  @Get('rules')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AutomationRead)
  async listRules(@Query() query: unknown): Promise<ListAutomationRulesResponse> {
    return this.automation.listRules(parse(listAutomationRulesQuerySchema, query));
  }

  /**
   * `GET /automation/rules/:id` — one rule's detail (row + recent run log). An
   * unknown or cross-tenant id is a `404 AUTOMATION_RULE_NOT_FOUND`.
   */
  @Get('rules/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AutomationRead)
  async getRule(@Param('id') id: string): Promise<GetAutomationRuleResponse> {
    return this.automation.getRule(id);
  }

  /**
   * `GET /automation/rules/:id/runs?limit` — one rule's run log, newest first.
   */
  @Get('rules/:id/runs')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AutomationRead)
  async listRuns(
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<ListAutomationRunsResponse> {
    return this.automation.listRuns(id, parse(listAutomationRunsQuerySchema, query));
  }

  /**
   * `POST /automation/rules` — create a rule (active by default). A `needsDays`
   * trigger missing `triggerConfig.days` is a `400`. Returns `201` with the detail.
   */
  @Post('rules')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.AutomationManage)
  async createRule(@Body() body: unknown): Promise<GetAutomationRuleResponse> {
    return this.automation.createRule(parse(createAutomationRuleSchema, body));
  }

  /**
   * `PATCH /automation/rules/:id` — edit a rule. Every field optional; the
   * per-trigger `days` rule is enforced against the merged record.
   */
  @Patch('rules/:id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AutomationManage)
  async updateRule(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetAutomationRuleResponse> {
    return this.automation.updateRule(id, parse(updateAutomationRuleSchema, body));
  }

  /**
   * `POST /automation/rules/:id/toggle` — flip a rule's active state. A template
   * can't be activated (`400`). Returns the updated detail.
   */
  @Post('rules/:id/toggle')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.AutomationManage)
  async toggleRule(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetAutomationRuleResponse> {
    return this.automation.toggleRule(id, parse(toggleAutomationRuleSchema, body));
  }

  /**
   * `POST /automation/rules/:id/save-as-template` — save the rule as a reusable,
   * inactive template. Returns `201` with the created template's detail.
   */
  @Post('rules/:id/save-as-template')
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.AutomationManage)
  async saveAsTemplate(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<GetAutomationRuleResponse> {
    return this.automation.saveAsTemplate(id, parse(saveAsTemplateSchema, body ?? {}));
  }

  /** `DELETE /automation/rules/:id` — delete a rule and its runs. Returns `204`. */
  @Delete('rules/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.AutomationManage)
  async deleteRule(@Param('id') id: string): Promise<void> {
    await this.automation.deleteRule(id);
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
