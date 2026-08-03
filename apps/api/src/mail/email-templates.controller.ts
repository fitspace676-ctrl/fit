import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import {
  Permission,
  emailTemplateKeySchema,
  updateEmailTemplateSchema,
  type EmailTemplateRow,
  type ListEmailTemplatesResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { EmailTemplatesService } from './email-templates.service';

/**
 * The gym's system email wording (`/gyms/settings/email-templates`).
 *
 * Read and write only — the sending happens wherever the event happens. Gated on
 * `GymManage` like the rest of settings: rewriting what every member receives is
 * the same class of decision as changing the gym's opening hours.
 */
@Controller('gyms/settings/email-templates')
@UseGuards(TenantGuard, PermissionsGuard)
export class EmailTemplatesController {
  constructor(private readonly templates: EmailTemplatesService) {}

  /**
   * `GET /gyms/settings/email-templates` — every system email, showing the
   * wording in force and whether this gym has edited it.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GymManage)
  async list(): Promise<ListEmailTemplatesResponse> {
    return this.templates.list();
  }

  /**
   * `PUT /gyms/settings/email-templates/:key` — save this gym's wording for one
   * template. An unknown key is a `400`, not a silently-created row: a typo would
   * otherwise store wording no event will ever send.
   */
  @Put(':key')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GymManage)
  async update(@Param('key') key: string, @Body() body: unknown): Promise<EmailTemplateRow> {
    return this.templates.update(
      parse(emailTemplateKeySchema, key),
      parse(updateEmailTemplateSchema, body),
    );
  }

  /**
   * `POST /gyms/settings/email-templates/:key/reset` — discard this gym's wording
   * and go back to the built-in default. Idempotent.
   */
  @Post(':key/reset')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.GymManage)
  async reset(@Param('key') key: string): Promise<EmailTemplateRow> {
    return this.templates.reset(parse(emailTemplateKeySchema, key));
  }
}

/** Parse with `schema`, raising a `400` listing each failing field. */
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
