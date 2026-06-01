import { Global, Module } from '@nestjs/common';
import { TenantPrismaService } from '../prisma/tenant-prisma.service';
import { TenantContext } from './tenant.context';
import { TenantGuard } from './tenant.guard';

/**
 * Tenant infrastructure, provided application-wide.
 *
 * Exposes the {@link TenantContext} accessor, the {@link TenantGuard} (attach
 * to gym-scoped controllers with `@UseGuards(TenantGuard)`), and the
 * tenant-scoped {@link TenantPrismaService}. `@Global` so any feature module can
 * inject them without re-importing this module.
 *
 * `TenantMiddleware` is **not** registered here — it is applied in `AppModule`
 * via `NestModule.configure`, which is where route scoping (and its public-route
 * exclusions) lives.
 */
@Global()
@Module({
  providers: [TenantContext, TenantGuard, TenantPrismaService],
  exports: [TenantContext, TenantGuard, TenantPrismaService],
})
export class TenantModule {}
