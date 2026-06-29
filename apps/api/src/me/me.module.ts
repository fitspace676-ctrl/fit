import { Module } from '@nestjs/common';
import { MeSubscriptionController } from './me-subscription.controller';
import { MeSubscriptionService } from './me-subscription.service';
import { MeProfileController } from './me-profile.controller';
import { MeProfileService } from './me-profile.service';
import { MeGoalsController } from './me-goals.controller';
import { MeGoalsService } from './me-goals.service';

/**
 * Member self-service ("/me/*").
 *
 * Endpoints where the signed-in member reads/manages their own data, resolved
 * from the session (no member id on the wire): `GET /me/subscription` (their
 * membership + billing) and `GET / PATCH /me/profile` (their name / phone). All
 * sit behind the app-wide `TenantGuard` + global `PermissionsGuard`; the tenant
 * client, guards, and tenant context come from `TenantModule` / `RbacModule`.
 */
@Module({
  controllers: [MeSubscriptionController, MeProfileController, MeGoalsController],
  providers: [MeSubscriptionService, MeProfileService, MeGoalsService],
})
export class MeModule {}
