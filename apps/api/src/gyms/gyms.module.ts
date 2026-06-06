import { Module } from '@nestjs/common';
import { GymSettingsController } from './gym-settings.controller';
import { GymSettingsService } from './gym-settings.service';
import { GymsController } from './gyms.controller';
import { GymsService } from './gyms.service';

/**
 * Gyms: platform-wide tenant management (`GET /gyms`) plus the staff console's
 * tenant-scoped gym settings (`/gyms/settings`, T4.8).
 *
 * Provisioning a gym + onboarding its owner lives in {@link AuthModule}
 * (`POST /auth/register-gym`) because it is a public, pre-tenant flow that
 * reuses the auth onboarding machinery. This module covers the authenticated
 * cross-tenant *read* side ({@link GymsController}/{@link GymsService}) and the
 * OWNER-only settings configuration ({@link GymSettingsController}/{@link
 * GymSettingsService}). It depends on the globally-provided `PrismaService`,
 * the `TenantGuard` + tenant-scoped Prisma from the global `TenantModule`, the
 * `PermissionsGuard` from `RbacModule`, and the `StorageService` from the global
 * `StorageModule`, so it only registers its own controllers + services.
 */
@Module({
  controllers: [GymsController, GymSettingsController],
  providers: [GymsService, GymSettingsService],
})
export class GymsModule {}
