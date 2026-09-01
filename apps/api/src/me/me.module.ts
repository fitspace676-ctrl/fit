import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { MeSubscriptionController } from './me-subscription.controller';
import { MeSubscriptionService } from './me-subscription.service';
import { MeInvoicesController } from './me-invoices.controller';
import { MeInvoicesService } from './me-invoices.service';
import { MeProfileController } from './me-profile.controller';
import { MeProfileService } from './me-profile.service';
import { MeGoalsController } from './me-goals.controller';
import { MePermissionsController } from './me-permissions.controller';
import { MeGoalsService } from './me-goals.service';

/**
 * Member self-service ("/me/*").
 *
 * Endpoints where the signed-in member reads/manages their own data, resolved
 * from the session (no member id on the wire): `GET /me/subscription` (their
 * membership + billing), `GET /me/invoices/:id/pdf` (download one of their own
 * invoices, T5.10), and `GET / PATCH /me/profile` (their name / phone). All sit
 * behind the app-wide `TenantGuard` + global `PermissionsGuard`. `GET
 * /me/permissions` joins them: the console's own view of what this session may do,
 * gated on the one capability an operator cannot revoke; the tenant client,
 * guards, and tenant context come from `TenantModule` / `RbacModule`. Imports
 * {@link BillingModule} for the shared `InvoiceDocumentService` the download reuses.
 */
@Module({
  imports: [BillingModule],
  controllers: [
    MeSubscriptionController,
    MeInvoicesController,
    MeProfileController,
    MeGoalsController,
    MePermissionsController,
  ],
  providers: [MeSubscriptionService, MeInvoicesService, MeProfileService, MeGoalsService],
})
export class MeModule {}
