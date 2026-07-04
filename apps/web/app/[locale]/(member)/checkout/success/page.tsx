import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { OrderItem, OrderSummary } from '@fit/types';
import { Link } from '@/src/i18n/navigation';
import { fetchOrder } from '@/lib/orders';

export const metadata: Metadata = {
  title: 'Order confirmed — Fit',
  description: 'Your membership purchase is confirmed.',
};

/**
 * The order is resolved per request from the `?orderId` the payment step
 * redirected with, so this can never be prerendered.
 */
export const dynamic = 'force-dynamic';

/** Raw search params the success page reads. */
interface SuccessSearchParams {
  orderId?: string;
}

/**
 * Purchase-wizard confirmation (step 4 success). Reads the `?orderId` the
 * payment step (`StepPayment`) redirected with, fetches the order summary
 * (`GET /orders/:orderId`) on the server, and confirms the purchase with an
 * itemised breakdown and a "Return home" CTA. A missing / unknown id renders a
 * graceful "we couldn't find that order" state rather than throwing — a buyer
 * who deep-links here without a real order still sees a sensible page.
 */
export default async function CheckoutSuccessPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SuccessSearchParams>;
}) {
  const [{ locale }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const t = await getTranslations('checkout');

  const order = sp.orderId ? await fetchOrder({ orderId: sp.orderId }).catch(() => null) : null;

  return (
    <div className="mx-auto w-full max-w-2xl px-gutter py-16">
      {order ? (
        <OrderConfirmation order={order} locale={locale} t={t} />
      ) : (
        <div className="flex flex-col items-center gap-4 text-center">
          <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">
            {t('success.missing.title')}
          </h1>
          <p className="text-sm text-ink-500 dark:text-ink-400">{t('success.missing.subtitle')}</p>
          <HomeCta label={t('success.returnHome')} />
        </div>
      )}
    </div>
  );
}

/** The confirmed-order panel: status badge, itemised total, and a home CTA. */
function OrderConfirmation({
  order,
  locale,
  t,
}: {
  order: OrderSummary;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<'checkout'>>>;
}) {
  return (
    <div className="flex flex-col items-center gap-8">
      <div className="flex flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <svg viewBox="0 0 24 24" fill="currentColor" className="h-8 w-8" aria-hidden="true">
            <path
              fillRule="evenodd"
              d="M20.5 6.3a1 1 0 0 1 0 1.4l-9.5 9.5a1 1 0 0 1-1.4 0l-4.5-4.5a1 1 0 1 1 1.4-1.4l3.8 3.79 8.8-8.79a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <h1 className="text-2xl font-semibold text-ink-900 dark:text-white">
          {t('success.title')}
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">{t('success.subtitle')}</p>
        <p className="text-xs text-ink-400 dark:text-ink-500">
          {t('success.orderId', { id: order.id })}
        </p>
      </div>

      <dl className="flex w-full flex-col gap-3 rounded-card border border-ink-200 dark:border-white/10 p-5">
        {order.items.map((item, index) => (
          <OrderItemRow
            key={`${item.label}-${index}`}
            item={item}
            locale={locale}
            currency={order.currency}
          />
        ))}
        <div className="flex items-center justify-between gap-3 border-t border-ink-100 dark:border-white/10 pt-3">
          <dt className="text-sm font-semibold text-ink-900 dark:text-white">
            {t('success.total')}
          </dt>
          <dd className="text-sm font-bold text-ink-900 dark:text-white">
            {formatMoney(locale, order.total, order.currency)}
          </dd>
        </div>
      </dl>

      <HomeCta label={t('success.returnHome')} />
    </div>
  );
}

/** One itemised line on the confirmation breakdown. */
function OrderItemRow({
  item,
  locale,
  currency,
}: {
  item: OrderItem;
  locale: string;
  currency: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="text-sm text-ink-500 dark:text-ink-400">{item.label}</dt>
      <dd className="text-right text-sm font-medium text-ink-900 dark:text-white">
        {formatMoney(locale, item.amount, currency)}
      </dd>
    </div>
  );
}

/** Locale-aware "Return home" link back to the member site root. */
function HomeCta({ label }: { label: string }) {
  return (
    <Link
      href="/"
      className="rounded-card bg-brand-600 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
    >
      {label}
    </Link>
  );
}

/** Format a minor-unit amount as a currency string (ISO 4217). */
function formatMoney(locale: string, amount: number, currency: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
