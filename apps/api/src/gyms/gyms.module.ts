import { Module } from '@nestjs/common';
import { GymsController } from './gyms.controller';
import { GymsService } from './gyms.service';

/**
 * Gyms: platform-wide tenant management (`GET /gyms`).
 *
 * Provisioning a gym + onboarding its owner lives in {@link AuthModule}
 * (`POST /auth/register-gym`) because it is a public, pre-tenant flow that
 * reuses the auth onboarding machinery. This module covers the authenticated,
 * cross-tenant *read* side. It depends on the globally-provided `PrismaService`
 * and the `TenantGuard` exported by the global `TenantModule`, so it only
 * registers its own controller + service.
 */
@Module({
  controllers: [GymsController],
  providers: [GymsService],
})
export class GymsModule {}
