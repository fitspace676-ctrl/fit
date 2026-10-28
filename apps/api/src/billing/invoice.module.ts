import { Module } from '@nestjs/common';
import { AutomationModule } from '../automation/automation.module';
import { InvoiceService } from './invoice.service';

/**
 * Invoicing — the single seam that mints numbered {@link Invoice} rows (T5.9).
 *
 * Exports the stateless {@link InvoiceService} so any flow that takes a subscription
 * charge inside its own transaction (member enrolment and the recurring-billing job in
 * {@link SubscriptionsModule} today; a POS-linked subscription charge later) can raise
 * the invoice atomically with that charge. Holds no Prisma client of its own — the
 * service operates on the caller's transaction. {@link AutomationModule} backs
 * `InvoiceService.announcePaid`, the post-commit `payment_received` trigger.
 */
@Module({
  imports: [AutomationModule],
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
