import {
  BadRequestException,
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from '@nestjs/common';
import { z } from 'zod';
import { Permission, createReviewSchema, type CreateReviewResponse } from '@fit/types';
import { RequirePermissions } from '../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../common/rbac/permissions.guard';
import { TenantGuard } from '../common/tenant/tenant.guard';
import { ReviewsService } from './reviews.service';

/**
 * Member review-submission endpoint (`POST /reviews`, T5.12).
 *
 * An authenticated, tenant-scoped member action: it sits behind
 * {@link TenantGuard} + the global {@link PermissionsGuard} and requires
 * {@link Permission.ReviewWrite} (granted to the `MEMBER` role). The member
 * reviews *themselves* — the review's member is the caller's own gym membership,
 * never a value off the wire, and the reviewed trainer is derived server-side
 * from the occurrence — so the body carries only the occurrence, rating, and an
 * optional comment. The public read of a trainer's reviews is a separate
 * `@Public()` surface ({@link import('./trainer-reviews.controller').TrainerReviewsController}).
 */
@Controller('reviews')
@UseGuards(TenantGuard, PermissionsGuard)
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  /**
   * `POST /reviews` — post the calling member's review of a class they attended.
   * The body is validated up front (`classInstanceId` required, `rating` an
   * integer 1–5, `comment` optional and bounded). Returns `201` with the new
   * review's id. Failure modes: `403 MEMBER_SESSION_REQUIRED` / `403 NOT_A_MEMBER`
   * (caller is not a member), `404 CLASS_INSTANCE_NOT_FOUND` (unknown / cross-tenant
   * occurrence), `403 NOT_ATTENDED` (no attended booking for that occurrence), and
   * `409 ALREADY_REVIEWED` (a second review for the same occurrence).
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(Permission.ReviewWrite)
  async create(@Body() body: unknown): Promise<CreateReviewResponse> {
    return this.reviews.create(parse(createReviewSchema, body));
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
