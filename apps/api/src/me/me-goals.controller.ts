import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Put,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permission, putMeGoalsSchema, type ListMeGoalsResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { MeGoalsService } from './me-goals.service';

/**
 * `GET / PUT /me/goals` — the calling member's training goals. Self-service behind
 * {@link TenantGuard} + {@link PermissionsGuard}, gated by {@link Permission.ProfileManage}
 * (held by every gym-scoped role). `PUT` replaces the whole set.
 */
@Controller('me/goals')
@UseGuards(TenantGuard, PermissionsGuard)
export class MeGoalsController {
  constructor(private readonly goals: MeGoalsService) {}

  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async list(): Promise<ListMeGoalsResponse> {
    return this.goals.listMyGoals();
  }

  @Put()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ProfileManage)
  async replace(@Body() body: unknown): Promise<ListMeGoalsResponse> {
    return this.goals.replaceMyGoals(parse(putMeGoalsSchema, body));
  }
}

/** Parse `data` with `schema`, raising a `400` listing each failing field. */
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
