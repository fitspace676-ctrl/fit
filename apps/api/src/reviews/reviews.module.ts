import { Module } from '@nestjs/common';
import { AdminReviewsController } from './admin-reviews.controller';
import { PublicReviewsService } from './public-reviews.service';
import { ReviewsController } from './reviews.controller';
import { ReviewsService } from './reviews.service';
import { TrainerReviewsController } from './trainer-reviews.controller';

/**
 * Reviews — three surfaces over a gym's class & trainer reviews (T5.12):
 *
 *  • {@link ReviewsController} (`POST /reviews`): the member-facing submission —
 *    an attendee rates + reviews a class they attended. Authenticated and
 *    tenant-scoped (behind `TenantGuard` + the global `PermissionsGuard`,
 *    `ReviewWrite`), with the attended-once-only logic in {@link ReviewsService}.
 *  • {@link TrainerReviewsController} (`GET /trainers/:id/reviews`): the public
 *    detail-page Reviews section. `@Public()` and excluded from the JWT
 *    `TenantMiddleware` (see `AppModule`), so an unauthenticated visitor reads a
 *    trainer's VISIBLE reviews + the live aggregate via {@link PublicReviewsService}.
 *  • {@link AdminReviewsController} (`/admin/trainers/:id/reviews`, `/admin/reviews/:id/hide`):
 *    the staff moderation queue + soft-hide actions (`ReviewModerate`), audit-logged
 *    in {@link ReviewsService}.
 *
 * The tenant-scoped Prisma client, the unscoped one, the guards, and the tenant
 * context all come from the app-wide `PrismaModule` / `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [ReviewsController, TrainerReviewsController, AdminReviewsController],
  providers: [ReviewsService, PublicReviewsService],
})
export class ReviewsModule {}
