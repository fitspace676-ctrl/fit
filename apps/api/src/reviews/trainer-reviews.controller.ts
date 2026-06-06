import {
  BadRequestException,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Query,
} from '@nestjs/common';
import { listTrainerReviewsQuerySchema, type ListTrainerReviewsResponse } from '@fit/types';
import { Public } from '../common/decorators/public.decorator';
import { PublicReviewsService } from './public-reviews.service';

/**
 * Public trainer-reviews endpoint (`GET /trainers/:id/reviews`, T5.12).
 *
 * Powers the Reviews section of the unauthenticated trainer detail page (T3.7): a
 * visitor browsing a gym's `<slug>.fit.ge` site, before any session exists, so
 * the route is `@Public()` (exempt from the global deny-by-default
 * {@link PermissionsGuard}) and the `trainers/:id/reviews` path is excluded from
 * the JWT `TenantMiddleware` in `AppModule` (which would otherwise 401 a tokenless
 * request). The gym is identified explicitly by the `gymId` query param the page
 * resolves from the subdomain, not a session — exactly like the public
 * {@link import('../trainers/trainers.controller').TrainersController}. Only
 * `VISIBLE` reviews are returned; staff moderation lives on the separate
 * `/admin/trainers/:id/reviews` surface.
 */
@Controller('trainers')
export class TrainerReviewsController {
  constructor(private readonly reviews: PublicReviewsService) {}

  /**
   * `GET /trainers/:id/reviews?gymId=<id>&page&limit` — one page of the trainer's
   * visible reviews plus the live aggregate (`avgRating`, `total`). The query is
   * validated up front (a bad/missing `gymId` or page/limit is a `400` with
   * per-field detail). An unknown / cross-tenant trainer id, or a trainer with no
   * reviews, is a normal `200` with an empty list and a `0` average.
   */
  @Get(':id/reviews')
  @HttpCode(HttpStatus.OK)
  @Public()
  async list(
    @Param('id') id: string,
    @Query() query: unknown,
  ): Promise<ListTrainerReviewsResponse> {
    const result = listTrainerReviewsQuerySchema.safeParse(query);
    if (!result.success) {
      throw new BadRequestException(
        result.error.issues.map((issue) => {
          const path = issue.path.join('.');
          return path ? `${path}: ${issue.message}` : issue.message;
        }),
      );
    }
    return this.reviews.listForTrainer(id, result.data);
  }
}
