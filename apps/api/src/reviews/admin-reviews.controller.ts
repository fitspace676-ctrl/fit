import {
  BadRequestException,
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
  listAdminTrainerReviewsQuerySchema,
  type ListAdminTrainerReviewsResponse,
  type SetReviewVisibilityResponse,
} from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReviewsService } from './reviews.service';

/**
 * Staff-console review moderation API (`/admin/...`, T5.12).
 *
 * Mounted alongside — not on top of — the `@Public()` review-discovery surface at
 * `/trainers/:id/reviews`. Every route here is tenant-scoped staff access:
 * {@link TenantGuard} pins the request to one gym and {@link PermissionsGuard}
 * enforces {@link Permission.ReviewModerate} (granted to OWNER / MANAGER). The
 * moderation queue lists *every* review (visible and hidden) for a trainer; the
 * hide / unhide actions flip visibility — never the content — and are audit-logged
 * in {@link ReviewsService}. The service runs on the tenant-scoped Prisma client,
 * so no handler ever passes a `gymId`.
 */
@Controller('admin')
@UseGuards(TenantGuard, PermissionsGuard)
export class AdminReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /**
   * `GET /admin/trainers/:id/reviews?page&limit&status` — one filtered, server-
   * paginated page of the trainer's reviews for the moderation queue. The query is
   * validated up front; omitting `status` returns visible *and* hidden reviews. A
   * `404 TRAINER_NOT_FOUND` for an unknown / cross-tenant id.
   */
  @Get('trainers/:id/reviews')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReviewModerate)
  async list(
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<ListAdminTrainerReviewsResponse> {
    return this.reviews.listForModeration(id, parse(listAdminTrainerReviewsQuerySchema, query));
  }

  /**
   * `POST /admin/reviews/:id/hide` — soft-hide an abusive review (T5.12): drop it
   * from the public listing and the trainer's aggregate without touching its
   * content. Idempotent; audit-logged. A `404 REVIEW_NOT_FOUND` for an unknown /
   * cross-tenant id. Returns the moderated review in its new state.
   */
  @Post('reviews/:id/hide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReviewModerate)
  async hide(@Param('id') id: string): Promise<SetReviewVisibilityResponse> {
    return { review: await this.reviews.hide(id) };
  }

  /**
   * `POST /admin/reviews/:id/unhide` — restore a hidden review to `VISIBLE`
   * (T5.12), the inverse of {@link hide}, re-counting it toward the trainer's
   * aggregate. Idempotent; audit-logged; `404`-on-miss.
   */
  @Post('reviews/:id/unhide')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(Permission.ReviewModerate)
  async unhide(@Param('id') id: string): Promise<SetReviewVisibilityResponse> {
    return { review: await this.reviews.unhide(id) };
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
