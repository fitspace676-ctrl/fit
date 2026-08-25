import { Module } from '@nestjs/common';
import { InvoiceModule } from '../billing/invoice.module';
import { GymsModule } from '../gyms/gyms.module';
import { AdminServicesController } from './admin-services.controller';
import { AdminServicesService } from './admin-services.service';
import { ServicesController } from './services.controller';
import { ServicesService } from './services.service';
import {
  AdminServiceSessionsController,
  MeServiceSessionsController,
  ServiceSlotsController,
} from './service-sessions.controller';
import { ServiceSessionsService } from './service-sessions.service';

/**
 * Services — the staff-delivered, priced catalogue a gym sells at the desk
 * (docs/superpowers/specs/2026-08-25-services-design.md). `GymsModule` supplies
 * `GymLocaleService` so a new service is priced in the gym's own currency. Guards,
 * tenant context and the scoped Prisma client come from the app-wide modules.
 * `ServicesController` is the public, `gymId`-scoped catalogue the member portal
 * reads (see `services.service.ts`).
 */
@Module({
  imports: [GymsModule, InvoiceModule],
  controllers: [
    AdminServicesController,
    ServicesController,
    AdminServiceSessionsController,
    ServiceSlotsController,
    MeServiceSessionsController,
  ],
  providers: [AdminServicesService, ServicesService, ServiceSessionsService],
  exports: [AdminServicesService],
})
export class ServicesModule {}
