import { Module } from '@nestjs/common';
import { InvoiceModule } from '../billing/invoice.module';
import { AdminSubscriptionEnrollmentController } from './admin-subscription-enrollment.controller';
import { AdminSubscriptionFreezeController } from './admin-subscription-freeze.controller';
import { PAYMENT_PROVIDER } from './payment-provider';
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
 */
@Module({
  imports: [InvoiceModule],
  controllers: [
    SubscriptionsController,
    AdminSubscriptionEnrollmentController,
    AdminSubscriptionFreezeController,
  ],
  providers: [
    SubscriptionFreezeService,
    SubscriptionEnrollmentService,
    SubscriptionBillingService,
    { provide: PAYMENT_PROVIDER, useClass: StubPaymentProvider },
  ],
})
export class SubscriptionsModule {}
