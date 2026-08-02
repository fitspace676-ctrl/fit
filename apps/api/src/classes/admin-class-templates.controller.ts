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
  createClassTemplateSchema,
  listAdminClassTemplatesQuerySchema,
  updateClassTemplateSchema,
  type CreateClassTemplateResponse,
  type GetAdminClassTemplateResponse,
  type ListAdminClassTemplatesResponse,
  type SetClassTemplateStatusResponse,
  type UpdateClassTemplateResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { AdminClassTemplatesService } from './admin-class-templates.service';

/**
 * Staff-console recurring class-template management API (`/admin/classes`, T5.2).
 *
 * Mounted under `/admin/classes` (mirroring `admin/packages`) so it sits
 * alongside the staff console's other tenant-scoped management surfaces — and
 * distinct from the public `GET /class-instances` discovery endpoint
 * ({@link ClassesController}). Every route here is tenant-scoped staff access:
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * enforces the capability. Reads require {@link Permission.ClassRead}; the writes
 * — create, edit, and pause/resume — require {@link Permission.ClassWrite}. The
 * service runs on the tenant-scoped Prisma client, so no handler ever passes a
 * `gymId`.
 */
@Controller('admin/classes')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminClassTemplatesController {
  constructor(private readonly templates: AdminClassTemplatesService) {}

  /**
   * `GET /admin/classes?page&limit&search&status&sort&dir` — one filtered,
   * server-paginated page of the gym's class templates. The query is validated up
   * front (a bad page/limit/status is a `400` with per-field detail) so the
   * service only sees a well-formed, defaulted request. An empty page is a normal
   * `200`.
   */
  @Get()
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async list(@Query() query: unknown): Promise<ListAdminClassTemplatesResponse> {
    return this.templates.listClassTemplates(parse(listAdminClassTemplatesQuerySchema, query));
  }

  /**
   * `GET /admin/classes/:id` — one class template's detail. An unknown or
   * cross-tenant id is a `404 CLASS_TEMPLATE_NOT_FOUND` from the service.
   */
  @Get(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassRead)
  async getOne(@Param('id') id: string): Promise<GetAdminClassTemplateResponse> {
    return this.templates.getClassTemplate(id);
  }

  /**
   * `POST /admin/classes` — create a class template (T5.2). The body is validated
   * up front (`title`, `rrule`, `capacity`, `durationMinutes`, `validFrom`
   * required; the rest optional with defaults, `status` defaults to `ACTIVE`).
   * Returns `201` with the detail.
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ClassWrite)
  async create(@Body() body: unknown): Promise<CreateClassTemplateResponse> {
    return this.templates.createClassTemplate(parse(createClassTemplateSchema, body));
  }

  /**
   * `PATCH /admin/classes/:id` — edit a class template's profile (T5.2). An unknown
   * or cross-tenant id is a `404 CLASS_TEMPLATE_NOT_FOUND`. Returns the updated
   * detail.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async update(
    @Param('id') id: string,
    @Body() body: unknown,
  ): Promise<UpdateClassTemplateResponse> {
    return this.templates.updateClassTemplate(id, parse(updateClassTemplateSchema, body));
  }

  /**
   * `POST /admin/classes/:id/pause` — set the template's status to `PAUSED` (T5.2),
   * stopping new occurrence generation. Idempotent; a `404` for an unknown /
   * cross-tenant id. Returns the updated detail.
   */
  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async pause(@Param('id') id: string): Promise<SetClassTemplateStatusResponse> {
    return this.templates.pauseClassTemplate(id);
  }

  /**
   * `DELETE /admin/classes/:id` — remove a class template (T5.15).
   *
   * The gym's history survives: occurrences that already happened, and future
   * ones a member has booked, are detached from the template rather than
   * cascaded away — see the service for the rule. `204` on success, `404` for an
   * unknown / cross-tenant id.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(Permission.ClassWrite)
  async remove(@Param('id') id: string): Promise<void> {
    await this.templates.deleteClassTemplate(id);
  }

  /**
   * `POST /admin/classes/:id/resume` — set the template's status back to `ACTIVE`
   * (T5.2), the inverse of {@link pause}. Idempotent; `404`-on-miss.
   */
  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ClassWrite)
  async resume(@Param('id') id: string): Promise<SetClassTemplateStatusResponse> {
    return this.templates.resumeClassTemplate(id);
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
