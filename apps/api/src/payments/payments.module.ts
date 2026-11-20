import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { IntegrationsModule } from '../integrations/integrations.module';
import { MarketingModule } from '../marketing/marketing.module';
import { FlittReturnController } from './flitt-return.controller';
import { FlittWebhookController } from './flitt-webhook.controller';
import { OnlinePaymentsService } from './online-payments.service';
import { PaymentSweepService } from './payment-sweep.service';
import { ProviderRefundService } from './provider-refund.service';

/**
 * Per-gym online payments (Flitt hosted checkout) — see
 * `docs/adr/payment-provider.md`, "Per-gym Flitt flow".
 *
 * A leaf module: it imports only {@link IntegrationsModule} (credentials +
 * `FlittClient`), {@link MarketingModule} (promo reserve / release) and
 * {@link AutomationModule} (post-payment automations), none of which import a
 * selling module. The sellers — `BillingModule` (credit packs), `CatalogueModule`
 * (`/checkout`), `CartModule` (shop) and `OrdersModule` (refunds) — import THIS
 * module, so there is no cycle. Fulfilment (minting a credit pack) lives here as
 * a plain function (`order-fulfilment.ts`) the stub path also calls, rather than
 * as a call back into `BillingModule`.
 */
@Module({
  imports: [IntegrationsModule, MarketingModule, AutomationModule],
  controllers: [FlittWebhookController, FlittReturnController],
  providers: [OnlinePaymentsService, ProviderRefundService, PaymentSweepService],
  exports: [OnlinePaymentsService, ProviderRefundService],
})
export class PaymentsModule {}
