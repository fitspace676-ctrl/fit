import * as stylex from '@stylexjs/stylex';
import { getTranslations } from 'next-intl/server';
import type { CheckoutProductType } from '@fit/types';
import { Icon } from '@/src/components/ui';
import { createNumberFormat } from '@fit/i18n';

/**
 * The wizard's running order summary — what the buyer has chosen so far, held in
 * view for the whole flow.
 *
 * Without it the wizard forgets itself: a visitor picks a branch on step 1 and a
 * plan on step 2, then spends step 3 filling in seven fields with no reminder of
 * what they are buying or what it costs, and only meets the price again on step
 * 4. That gap is where people stall — they scroll back to check, or abandon. So
 * the choice stays pinned beside the form, and the price is visible from the
 * moment it exists.
 *
 * Rendered on the server from the URL (`?locationId`, `?packageId`,
 * `?productType`), which the steps write on every Continue — so it needs no
 * client state of its own and cannot drift from the selection the payment step
 * will actually charge for.
 */
const styles = stylex.create({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
    padding: '1.25rem',
  },
  /**
   * On a wide viewport the card follows the buyer down a long form; on narrow
   * ones it sits inline above the step, where sticky would eat the screen.
   */
  sticky: {
    position: {
      default: 'static',
      '@media (min-width: 64rem)': 'sticky',
    },
    top: '1.5rem',
  },
  title: {
    margin: 0,
    fontSize: '0.6875rem',
    fontWeight: 700,
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    color: 'var(--color-text-secondary)',
  },
  rows: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  row: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.625rem',
  },
  rowIcon: {
    marginTop: '0.125rem',
    flexShrink: 0,
    width: '1rem',
    height: '1rem',
    color: 'var(--color-text-accent)',
  },
  rowBody: {
    display: 'flex',
    minWidth: 0,
    flexDirection: 'column',
    gap: '0.125rem',
  },
  rowLabel: {
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  rowValue: {
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  divider: {
    height: '1px',
    backgroundColor: 'var(--color-border)',
  },
  totalRow: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.75rem',
  },
  totalLabel: {
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  totalValue: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.375rem',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  cadence: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  /** The "nothing chosen yet" state — step 1, before any selection exists. */
  empty: {
    margin: 0,
    fontSize: '0.875rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  note: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '0.5rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-subtle)',
    paddingInline: '0.75rem',
    paddingBlock: '0.625rem',
    fontSize: '0.75rem',
    lineHeight: 1.5,
    color: 'var(--color-text-secondary)',
  },
  noteIcon: {
    marginTop: '0.125rem',
    flexShrink: 0,
    width: '0.875rem',
    height: '0.875rem',
  },
});

/** The chosen product, resolved to display copy by the page. */
export interface OrderSummaryProduct {
  name: string;
  priceAmount: number;
  currency: string;
  type: CheckoutProductType;
  /** Localised cadence line ("per month"), or null for a one-off purchase. */
  cadence: string | null;
}

export interface OrderSummaryProps {
  locale: string;
  /** Chosen branch name, when one has been picked (or the gym has only one). */
  locationName?: string | null;
  /** Chosen product, once step 2 is done. */
  product?: OrderSummaryProduct | null;
}

/**
 * Render the running summary. Shows an explanatory empty state until the first
 * choice lands, so the rail never appears as a blank box.
 */
export async function OrderSummary({ locale, locationName, product }: OrderSummaryProps) {
  const t = await getTranslations('checkout');

  return (
    <aside {...stylex.props(styles.card, styles.sticky)} aria-label={t('summary.title')}>
      <h2 {...stylex.props(styles.title)}>{t('summary.title')}</h2>

      {!locationName && !product ? (
        <p {...stylex.props(styles.empty)}>{t('summary.empty')}</p>
      ) : (
        <div {...stylex.props(styles.rows)}>
          {locationName ? (
            <div {...stylex.props(styles.row)}>
              <Icon name="pin" {...stylex.props(styles.rowIcon)} sw={2.2} />
              <span {...stylex.props(styles.rowBody)}>
                <span {...stylex.props(styles.rowLabel)}>{t('summary.branch')}</span>
                <span {...stylex.props(styles.rowValue)}>{locationName}</span>
              </span>
            </div>
          ) : null}

          {product ? (
            <div {...stylex.props(styles.row)}>
              <Icon name="check" {...stylex.props(styles.rowIcon)} sw={2.4} />
              <span {...stylex.props(styles.rowBody)}>
                <span {...stylex.props(styles.rowLabel)}>{t(`packages.tabs.${product.type}`)}</span>
                <span {...stylex.props(styles.rowValue)}>{product.name}</span>
              </span>
            </div>
          ) : null}
        </div>
      )}

      {product ? (
        <>
          <span {...stylex.props(styles.divider)} />
          <div>
            <p {...stylex.props(styles.totalRow)}>
              <span {...stylex.props(styles.totalLabel)}>{t('summary.total')}</span>
              <span {...stylex.props(styles.totalValue)}>
                {formatMoney(locale, product.priceAmount, product.currency)}
              </span>
            </p>
            {product.cadence ? <p {...stylex.props(styles.cadence)}>{product.cadence}</p> : null}
          </div>
        </>
      ) : null}

      <p {...stylex.props(styles.note)}>
        <Icon name="info" {...stylex.props(styles.noteIcon)} sw={2.2} />
        {t('summary.note')}
      </p>
    </aside>
  );
}

/** Format a minor-unit amount against its own currency (ISO 4217). */
function formatMoney(locale: string, amount: number, currency: string): string {
  return createNumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2,
  }).format(amount / 100);
}
