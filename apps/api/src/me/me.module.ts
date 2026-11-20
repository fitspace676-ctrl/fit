import { MeAccountController } from './me-account.controller';
import { MeAccountService } from './me-account.service';
import { Module } from '@nestjs/common';
import { MePhotoController } from './me-photo.controller';
import { MePhotoService } from './me-photo.service';
import { BillingModule } from '../billing/billing.module';
import { PaymentsModule } from '../payments/payments.module';
import { MeSubscriptionController } from './me-subscription.controller';
import { MeSubscriptionService } from './me-subscription.service';
import { MeInvoicesController } from './me-invoices.controller';
import { MeInvoicesService } from './me-invoices.service';
import { MeProfileController } from './me-profile.controller';
import { MeProfileService } from './me-profile.service';
import { MeGoalsController } from './me-goals.controller';
import { MePermissionsController } from './me-permissions.controller';
import { MeGoalsService } from './me-goals.service';
import { MeOrdersController } from './me-orders.controller';
import { MeOrdersService } from './me-orders.service';

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
 *
 * `GET /me/orders` is the newest of them: the member's own purchase history, which
 * had no member-callable route at all — the roster (`GET /orders`) is `BillingRead`
 * staff-only, and `GET /checkout/:orderId` confirms one order you already hold the
 * id of. It needs nothing from `BillingModule`; it reads `Order` off the same
 * tenant-scoped client the other `/me` services use.
 */
@Module({
  // `PaymentsModule` for `POST /me/subscription/pay` (Flitt hosted checkout).
  imports: [BillingModule, PaymentsModule],
  controllers: [
    MeAccountController,
    MePhotoController,
    MeSubscriptionController,
    MeInvoicesController,
    MeProfileController,
    MeGoalsController,
    MeOrdersController,
    MePermissionsController,
  ],
  providers: [
    MeAccountService,
    MePhotoService,
    MeSubscriptionService,
    MeInvoicesService,
    MeProfileService,
    MeGoalsService,
    MeOrdersService,
  ],
})
export class MeModule {}
