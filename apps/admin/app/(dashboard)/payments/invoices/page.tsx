import type { Metadata } from 'next';
import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { PaymentsTabs } from '@/components/payments-tabs';
import { buttonClasses } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Payments · Invoices — Fit Admin',
  description:
    'Member invoices are generated per subscription and order and are downloadable as PDFs from each member’s payment history.',
};

export const dynamic = 'force-dynamic';

/**
 * The Payments hub's Invoices tab. Our billing backend issues numbered invoices
 * per subscription/order and exposes them for download per member
 * (`GET /invoices/:id/pdf`), but has no gym-wide invoice listing endpoint, so
 * this tab keeps the hub's structural parity with the reference admin while
 * pointing staff at the per-member invoice history where the documents live.
 */
export default async function InvoicesPage() {
  const t = await getTranslations('admin.invoicesHub');

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          {t('title')}
        </h1>
        <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">{t('subtitle')}</p>
      </header>

      <PaymentsTabs />

      <div className="flex flex-col items-start gap-4 rounded-card border border-ink-200 bg-white p-8 dark:border-white/10 dark:bg-white/[0.03]">
        <p className="max-w-xl text-sm text-ink-600 dark:text-ink-300">{t('description')}</p>
        <Link href="/members" className={buttonClasses('primary', 'sm')}>
          {t('cta')}
        </Link>
      </div>
    </div>
  );
}
