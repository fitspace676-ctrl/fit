import { Module } from '@nestjs/common';
import { PlatformLeadsController } from './platform-leads.controller';
import { PlatformLeadsService } from './platform-leads.service';

/**
 * Platform (T8.2) — public, tenant-less endpoints the marketing site calls.
 *
 * Currently the sales-lead capture (`POST /platform/leads`) behind the trial/demo
 * forms. The unscoped `PrismaService` and the shared `MailerService` come from the
 * app-wide global `PrismaModule` / `MailModule`.
 */
@Module({
  controllers: [PlatformLeadsController],
  providers: [PlatformLeadsService],
})
export class PlatformModule {}
