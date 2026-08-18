import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import type { OrderItem, OrderSummary } from '@fit/types';
import { cookies } from 'next/headers';
import { Icon } from '@/src/components/ui';
import { ACCESS_TOKEN_COOKIE } from '@/lib/auth-session';
import { fetchOrder } from '@/lib/orders';
import { HomeCta } from '../home-cta';
import { createNumberFormat } from '@fit/i18n';

export const metadata: Metadata = {
  title: 'Order confirmed - FormaCore',
  description: 'Your membership purchase is confirmed.',
};

/**
 * The order is resolved per request from the `?orderId` the payment step
 * redirected with, so this can never be prerendered.
 */
export const dynamic = 'force-dynamic';

// Astryx migration (T11), now on the portal kit: the purchase-wizard confirmation is rebuilt on the
// Fit brand theme — the success mark, itemised breakdown and missing-order state
// authored in compiled StyleX (`var(--color-*)` / `var(--font-family-*)`) with
// the "Return home" CTA on the kit's `Button` — no Tailwind utilities. The
// order fetch is unchanged.
const styles = stylex.create({
  page: {
    marginInline: 'auto',
    width: '100%',
    maxWidth: '32rem',
    paddingInline: '1.25rem',
    paddingBlock: '4rem',
  },
  centered: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '1rem',
    textAlign: 'center',
  },
  /**
   * The "confirm your email" notice.
   *
   * Signing up issues a session immediately, so a new member walks straight into
   * the portal and nothing on screen suggests anything is outstanding — until
   * the session expires and the next sign-in is refused with
   * `EMAIL_NOT_VERIFIED`. Saying so here, at the moment the verification mail
   * actually lands, is the difference between a one-click confirmation and a
   * locked-out member who never knew there was a step left.
   */
  verify: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
    margin: 0,
    borderRadius: 'var(--radius-container)',
    paddingInline: '1rem',
    paddingBlock: '0.875rem',
    fontSize: '0.875rem',
    lineHeight: 1.5,
    textAlign: 'left',
    color: 'var(--color-text-primary)',
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 10%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--color-accent) 28%, transparent)',
  },
  verifyIcon: {
    marginTop: '0.1875rem',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-accent)',
  },
  confirmation: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2rem',
  },
  mark: {
    display: 'grid',
    height: '3.5rem',
    width: '3.5rem',
    placeItems: 'center',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    color: 'var(--color-text-accent)',
  },
  markGlyph: {
    height: '2rem',
    width: '2rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  orderId: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-disabled)',
  },
  summary: {
    display: 'flex',
    width: '100%',
    flexDirection: 'column',
    gap: '0.75rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    padding: '1.25rem',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  itemLabel: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  itemValue: {
    margin: 0,
    textAlign: 'right',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  totalRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '0.75rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingTop: '0.75rem',
  },
  totalLabel: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  totalValue: {
    margin: 0,
    fontSize: '0.875rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
});

/** Raw search params the success page reads. */
interface SuccessSearchParams {
  orderId?: string;
}

/**
 * Purchase-wizard confirmation (step 4 success). Reads the `?orderId` the
 * purchase screen (`CheckoutScreen`) redirected with, fetches the order summary
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

  // The confirmation is the buyer's *own* order, so it is read with their token
  // rather than anonymously. A missing cookie falls through to the "order not
  // found" state, which is also the right answer for a stale confirmation link
  // opened after signing out.
  const accessToken = (await cookies()).get(ACCESS_TOKEN_COOKIE)?.value;
  const order =
    sp.orderId && accessToken
      ? await fetchOrder({ orderId: sp.orderId, accessToken }).catch(() => null)
      : null;

  return (
    <div {...stylex.props(styles.page)}>
      {order ? (
        <OrderConfirmation order={order} locale={locale} t={t} />
      ) : (
        <div {...stylex.props(styles.centered)}>
          <h1 {...stylex.props(styles.title)}>{t('success.missing.title')}</h1>
          <p {...stylex.props(styles.subtitle)}>{t('success.missing.subtitle')}</p>
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
    <div {...stylex.props(styles.confirmation)}>
      <div {...stylex.props(styles.centered)}>
        <span {...stylex.props(styles.mark)}>
          <svg
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
            {...stylex.props(styles.markGlyph)}
          >
            <path
              fillRule="evenodd"
              d="M20.5 6.3a1 1 0 0 1 0 1.4l-9.5 9.5a1 1 0 0 1-1.4 0l-4.5-4.5a1 1 0 1 1 1.4-1.4l3.8 3.79 8.8-8.79a1 1 0 0 1 1.4 0Z"
              clipRule="evenodd"
            />
          </svg>
        </span>
        <h1 {...stylex.props(styles.title)}>{t('success.title')}</h1>
        <p {...stylex.props(styles.subtitle)}>{t('success.subtitle')}</p>
        <p {...stylex.props(styles.orderId)}>{t('success.orderId', { id: order.id })}</p>
      </div>

      <dl {...stylex.props(styles.summary)}>
        {order.items.map((item, index) => (
          <OrderItemRow
            key={`${item.label}-${index}`}
            item={item}
            locale={locale}
            currency={order.currency}
          />
        ))}
        <div {...stylex.props(styles.totalRow)}>
          <dt {...stylex.props(styles.totalLabel)}>{t('success.total')}</dt>
          <dd {...stylex.props(styles.totalValue)}>
            {formatMoney(locale, order.total, order.currency)}
          </dd>
        </div>
      </dl>

      <p {...stylex.props(styles.verify)}>
        <Icon name="mail" {...stylex.props(styles.verifyIcon)} sw={2.2} />
        {t('success.verifyEmail')}
      </p>

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
    <div {...stylex.props(styles.itemRow)}>
      <dt {...stylex.props(styles.itemLabel)}>{item.label}</dt>
      <dd {...stylex.props(styles.itemValue)}>{formatMoney(locale, item.amount, currency)}</dd>
    </div>
  );
}

/** Format a minor-unit amount as a currency string (ISO 4217). */
function formatMoney(locale: string, amount: number, currency: string): string {
  return createNumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
