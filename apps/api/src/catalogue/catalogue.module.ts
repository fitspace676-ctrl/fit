import { Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module';
import { LocationsModule } from '../locations/locations.module';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module';
import { CatalogueController } from './catalogue.controller';
import { CatalogueService } from './catalogue.service';
import { CheckoutController } from './checkout.controller';
import { CheckoutService } from './checkout.service';

/**
 * The public join flow: browsing what a gym sells (`GET /catalogue`) and buying
 * it (`POST /checkout`, `GET /checkout/:orderId`).
 *
 * The two halves sit either side of the wizard's signup step, which is why they
 * live together but guard differently — the catalogue is `@Public()` (a visitor
 * browses before any account exists) while checkout runs behind the
 * `TenantGuard` + global `PermissionsGuard` (by then the buyer has a session).
 *
 * Imports supply the reads and purchases this module composes rather than
 * duplicates: {@link LocationsModule} for the branch listing `GET /locations`
 * already serves, {@link BillingModule} for the credit-pack purchase (order +
 * stub payment + minted pack, in one transaction), and
 * {@link SubscriptionsModule} for member self-enrolment (snapshot terms + first
 * invoice). Only the plain-package purchase, which had no existing path, is
 * written here — see {@link CheckoutService}.
 */
import { MarketingModule } from '../marketing/marketing.module';

@Module({
  imports: [MarketingModule, LocationsModule, BillingModule, SubscriptionsModule],
  controllers: [CatalogueController, CheckoutController],
  providers: [CatalogueService, CheckoutService],
})
export class CatalogueModule {}
