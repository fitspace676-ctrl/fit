import { Module } from '@nestjs/common';
import { GymsModule } from '../gyms/gyms.module';
import { AdminServicesController } from './admin-services.controller';
import { AdminServicesService } from './admin-services.service';

/**
 * Services — the staff-delivered, priced catalogue a gym sells at the desk
 * (docs/superpowers/specs/2026-08-25-services-design.md). `GymsModule` supplies
 * `GymLocaleService` so a new service is priced in the gym's own currency. Guards,
 * tenant context and the scoped Prisma client come from the app-wide modules.
 */
@Module({
  imports: [GymsModule],
  controllers: [AdminServicesController],
  providers: [AdminServicesService],
  exports: [AdminServicesService],
})
export class ServicesModule {}
