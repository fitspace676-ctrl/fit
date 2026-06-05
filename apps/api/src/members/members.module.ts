import { Module } from '@nestjs/common';
import { MembersController } from './members.controller';
import { MembersService } from './members.service';

/**
 * Members: the staff console's member-management surface (`/members`, T4.2).
 *
 * Registers only its controller + service; the tenant-scoped Prisma client
 * (`TenantPrismaService`), the `TenantGuard`, and the global `PermissionsGuard`
 * all come from the app-wide `TenantModule` / `RbacModule`. The routes are
 * session-bound and tenant-scoped, so they sit behind the default
 * `TenantMiddleware` with no `AppModule` exclusion.
 */
@Module({
  controllers: [MembersController],
  providers: [MembersService],
})
export class MembersModule {}
