import { Module } from '@nestjs/common';
import { InvoiceService } from './invoice.service';

/**
 * Invoicing — the single seam that mints numbered {@link Invoice} rows (T5.9).
 *
 * Exports the stateless {@link InvoiceService} so any flow that takes a subscription
 * charge inside its own transaction (member enrolment and the recurring-billing job in
 * {@link SubscriptionsModule} today; a POS-linked subscription charge later) can raise
 * the invoice atomically with that charge. Holds no Prisma client of its own — the
 * service operates on the caller's transaction — so it has nothing else to wire.
 */
@Module({
  providers: [InvoiceService],
  exports: [InvoiceService],
})
export class InvoiceModule {}
