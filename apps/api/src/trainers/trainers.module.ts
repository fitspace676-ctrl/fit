import { Module } from '@nestjs/common';
import { AdminTrainersController } from './admin-trainers.controller';
import { AdminTrainersService } from './admin-trainers.service';
import { TrainersController } from './trainers.controller';
import { TrainersService } from './trainers.service';

/**
 * Trainers — two surfaces over the gym's trainer roster:
 *
 *  • {@link TrainersController} (`GET /trainers`): the public trainer-discovery
 *    index (T3.6). The endpoint is `@Public()` and excluded from the JWT
 *    `TenantMiddleware` (see `AppModule`), so an unauthenticated visitor on a gym
 *    subdomain can browse the roster.
 *  • {@link AdminTrainersController} (`/admin/trainers`): the staff console's
 *    tenant-scoped trainer management (CRUD + photo upload, T4.4), behind the
 *    `TenantGuard` + global `PermissionsGuard`. The tenant-scoped Prisma client,
 *    the guards, and the tenant context all come from the app-wide
 *    `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [TrainersController, AdminTrainersController],
  providers: [TrainersService, AdminTrainersService],
})
export class TrainersModule {}
