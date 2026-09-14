import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PortalBranchService } from './portal-branch.service';

/**
 * Provides {@link PortalBranchService} to the public member-portal listings.
 * {@link AuthModule} supplies the `TokenService` it verifies the optional session
 * with; Prisma comes from the global module.
 */
@Module({
  imports: [AuthModule],
  providers: [PortalBranchService],
  exports: [PortalBranchService],
})
export class PortalBranchModule {}
