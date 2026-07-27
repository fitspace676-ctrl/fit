import { Module } from '@nestjs/common';
import { InvoiceModule } from '../billing/invoice.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AdminSubscriptionEnrollmentController } from './admin-subscription-enrollment.controller';
import { AdminSubscriptionFreezeController } from './admin-subscription-freeze.controller';
import { BillingNotificationsService } from './billing-notifications.service';
import { PAYMENT_PROVIDER } from './payment-provider';
import { PaymentWebhookController } from './payment-webhook.controller';
import { StubPaymentProvider } from './stub-payment-provider';
import { SubscriptionBillingService } from './subscription-billing.service';
import { SubscriptionEnrollmentService } from './subscription-enrollment.service';
import { SubscriptionFreezeService } from './subscription-freeze.service';
import { SubscriptionsController } from './subscriptions.controller';

/**
 * Subscriptions — the member-facing subscription lifecycle surface plus member
 * enrolment (T5.3, freeze / pause flow T8.4) and the recurring-billing job (T5.4).
 *
 * {@link SubscriptionsController} (`/subscriptions`) sits behind the `TenantGuard` +
 * global `PermissionsGuard` and serves a member acting on their *own* membership:
 * enrolling (`POST /subscriptions`) and freezing / unfreezing it
 * (`SubscriptionManage`). {@link AdminSubscriptionEnrollmentController}
 * (`POST /admin/subscriptions/enroll`) is the staff counterpart that enrols a member
 * from the console (`BillingManage`); both share the one
 * {@link SubscriptionEnrollmentService}. Distinct from {@link SubscriptionPlansModule},
 * which owns the staff console's subscription-*plan* CRUD (`/admin/subscriptions`,
 * T8.2). The tenant-scoped Prisma client, the guards, and the tenant context all
 * come from the app-wide `TenantModule` / `RbacModule`.
 *
 * {@link SubscriptionBillingService} is the scheduled cross-tenant job that renews
 * live memberships each period, charging through the {@link PaymentProvider} seam —
 * bound here to the MVP {@link StubPaymentProvider} under the {@link PAYMENT_PROVIDER}
 * token so the real gateway (T8.8) drops in without touching the job. Prisma + Redis
 * come from their global modules; the cron runs off the app-wide `ScheduleModule`.
 * {@link BillingNotificationsService} (T8.7) is the seam that job calls to notify a
 * member of their subscription's money events — renewal / trial conversion, a failed
 * charge on the dunning ladder, and a heads-up before a trial converts — layered over
 * the {@link NotificationService} dispatch pipeline from the imported
 * {@link NotificationsModule}.
 *
 * {@link PaymentWebhookController} (`POST /webhooks/payments/:provider`) is the
 * inbound counterpart of that seam — the public entry point a real gateway posts
 * events back to. It dispatches to whichever provider is bound under
 * {@link PAYMENT_PROVIDER}, so it too lights up when the real integration lands
 * without a controller change (the stub declares no webhook handler, so its route
 * answers `501` today).
 */
@Module({
  imports: [InvoiceModule, NotificationsModule],
  controllers: [
    SubscriptionsController,
    AdminSubscriptionEnrollmentController,
    AdminSubscriptionFreezeController,
    PaymentWebhookController,
  ],
  providers: [
    SubscriptionFreezeService,
    SubscriptionEnrollmentService,
    SubscriptionBillingService,
    BillingNotificationsService,
    { provide: PAYMENT_PROVIDER, useClass: StubPaymentProvider },
  ],
  // The join wizard's checkout (`POST /checkout`) enrols a member on a plan
  // through this same self-service path rather than re-implementing enrolment.
  exports: [SubscriptionEnrollmentService],
})
export class SubscriptionsModule {}
