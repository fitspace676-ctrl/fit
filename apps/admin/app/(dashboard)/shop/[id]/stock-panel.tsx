import Link from 'next/link';
import { getLocale, getTranslations } from 'next-intl/server';
import * as stylex from '@stylexjs/stylex';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  resolveStockLevel,
  type GetAdminProductResponse,
  type StockMovementReason,
  type StockMovementRow,
} from '@fit/types';
import { Badge, Card, type BadgeTone } from '@fit/ui-kit';
import { StockAdjuster } from '../low-stock/stock-adjuster';
import { createDateTimeFormat, createNumberFormat } from '@fit/i18n';

const REASON_KEYS: Record<StockMovementReason, StockMovementReason> = {
  RECEIVE: 'RECEIVE',
  ADJUSTMENT: 'ADJUSTMENT',
  RECOUNT: 'RECOUNT',
  WRITE_OFF: 'WRITE_OFF',
  SALE: 'SALE',
  REFUND_RESTOCK: 'REFUND_RESTOCK',
};

const styles = stylex.create({
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  headRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  heading: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.125rem',
    fontWeight: 700,
    color: 'var(--color-text-primary)',
  },
  subtle: {
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  card: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  th: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    textAlign: 'start',
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
  },
  td: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border-subtle, var(--color-border))',
    color: 'var(--color-text-primary)',
    verticalAlign: 'middle',
  },
  num: {
    textAlign: 'end',
    fontVariantNumeric: 'tabular-nums',
  },
  actionCell: {
    textAlign: 'end',
    width: '1%',
    whiteSpace: 'nowrap',
  },
  deltaUp: {
    color: 'var(--color-text-accent)',
    fontWeight: 600,
  },
  deltaDown: {
    color: 'var(--color-error)',
    fontWeight: 600,
  },
  muted: {
    color: 'var(--color-text-secondary)',
  },
  empty: {
    margin: 0,
    padding: '1rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  note: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  link: {
    color: 'var(--color-text-accent)',
    textDecoration: 'none',
  },
});

/** The badge tone each derived level wears beside a position's count. */
const LEVEL_TONES: Record<
  string,
  { labelKey: 'untracked' | 'out' | 'low' | 'in'; tone: BadgeTone }
> = {
  untracked: { labelKey: 'untracked', tone: 'neutral' },
  out: { labelKey: 'out', tone: 'danger' },
  low: { labelKey: 'low', tone: 'pending' },
  in: { labelKey: 'in', tone: 'positive' },
};

/** One addressable stock position, flattened for the table. */
interface Position {
  variantIndex: number | null;
  label: string;
  sku: string;
  stock: number | null;
}

/**
 * The product's inventory: what is on hand across the gym, and the ledger of how
 * it got there.
 *
 * A product tracks stock one of two ways, so the table shows whichever applies —
 * one row per variant, or a single row for the product sold as-is. An untracked
 * product still gets its row, with an Adjust button: recording a delivery is how a
 * gym starts counting something, and hiding the control would leave no way in.
 *
 * ## Every count here is a roll-up, and the column says so
 *
 * The product record carries the gym-wide total, not any one branch's shelf (see
 * the page's header comment for why). Under a branch filter that is exactly the
 * kind of figure that gets misread, so the column is labelled "all branches"
 * whatever the console is scoped to — a header that changed with the filter while
 * the number underneath did not would be worse than one that never moves.
 *
 * The consequence for the adjuster is the interesting one. It cannot offer "set
 * this branch's shelf to N" from a number that came from every branch added
 * together, so on this page it records a signed movement instead — "+12 arrived at
 * Riverside" — and the absolute recount lives on `/shop/inventory`, where the count
 * on screen really is one branch's. See `StockAdjuster`'s `stockLocationId`.
 *
 * The history below is the answer to "why is this 3?". Sales and refunds appear
 * alongside manual corrections because the checkout writes to the same ledger, so
 * a drop between two stocktakes is explained rather than mysterious. It is the one
 * per-branch surface on the page, so every row names its branch.
 */
export async function StockPanel({
  product,
  movements,
  canWrite,
  canViewMovements,
  branchName,
}: {
  product: GetAdminProductResponse;
  movements: StockMovementRow[];
  /** Whether the staff session holds `InventoryAdjust` (shows the adjust controls). */
  canWrite: boolean;
  /** Whether the staff session holds `StockMovementRead` (shows the ledger). */
  canViewMovements: boolean;
  /** The console's active branch, or `null` in "All locations" mode. */
  branchName: string | null;
}) {
  const [t, locale] = await Promise.all([getTranslations('admin.shop.stockPanel'), getLocale()]);
  const nf = createNumberFormat(locale);
  const dtf = createDateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const positions: Position[] =
    product.variants.length > 0
      ? product.variants.map((variant, index) => ({
          variantIndex: index,
          label: variant.name,
          sku: variant.sku,
          stock: variant.stock,
        }))
      : [{ variantIndex: null, label: product.name, sku: '', stock: product.stock }];

  const threshold = product.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD;
  const thresholdFormatted = nf.format(threshold);

  return (
    <section {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.headRow)}>
        <h2 {...stylex.props(styles.heading)}>{t('heading')}</h2>
        <span {...stylex.props(styles.subtle)}>
          {product.lowStockThreshold === null
            ? t('thresholdDefault', { threshold: thresholdFormatted })
            : t('thresholdCustom', { threshold: thresholdFormatted })}
        </span>
      </div>

      <Card padding="none" xstyle={styles.card}>
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>{t('colPosition')}</th>
              <th {...stylex.props(styles.th)}>{t('colSku')}</th>
              <th {...stylex.props(styles.th, styles.num)}>{t('colOnHandAllBranches')}</th>
              <th {...stylex.props(styles.th)}>{t('colStatus')}</th>
              {canWrite ? <th {...stylex.props(styles.th)} /> : null}
            </tr>
          </thead>
          <tbody>
            {positions.map((position) => {
              const level = resolveStockLevel({
                lowestStock: position.stock,
                lowStockThreshold: product.lowStockThreshold,
              });
              const badge = LEVEL_TONES[level]!;
              return (
                <tr key={position.variantIndex ?? 'base'}>
                  <td {...stylex.props(styles.td)}>{position.label}</td>
                  <td {...stylex.props(styles.td, styles.muted)}>{position.sku || '-'}</td>
                  <td {...stylex.props(styles.td, styles.num)}>
                    {position.stock === null ? '-' : nf.format(position.stock)}
                  </td>
                  <td {...stylex.props(styles.td)}>
                    <Badge tone={badge.tone} label={t(`level.${badge.labelKey}`)} />
                  </td>
                  {canWrite ? (
                    <td {...stylex.props(styles.td, styles.actionCell)}>
                      {/* `null` — the count beside this button is a roll-up, so the
                          adjuster records a movement rather than a recount. */}
                      <StockAdjuster
                        productId={product.id}
                        productName={product.name}
                        variantIndex={position.variantIndex}
                        variantName={position.label}
                        sku={position.sku}
                        stock={position.stock}
                        stockLocationId={null}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <p {...stylex.props(styles.note)}>
        {t.rich('gymWideNote', {
          inventory: (chunks) => (
            <Link href="/shop/inventory" {...stylex.props(styles.link)}>
              {chunks}
            </Link>
          ),
        })}
      </p>

      {/* The ledger is a capability of its own (`StockMovementRead`): a
          receptionist may see what a branch holds without being shown who
          moved it, or why. */}
      {canViewMovements ? (
        <>
          <div {...stylex.props(styles.headRow)}>
            <h2 {...stylex.props(styles.heading)}>{t('historyHeading')}</h2>
            <span {...stylex.props(styles.subtle)}>
              {branchName === null
                ? t('mostRecentFirst')
                : t('branchMostRecentFirst', { branch: branchName })}
            </span>
          </div>

          <Card padding="none" xstyle={styles.card}>
            {movements.length === 0 ? (
              <p {...stylex.props(styles.empty)}>{t('historyEmpty')}</p>
            ) : (
              <table {...stylex.props(styles.table)}>
                <thead>
                  <tr>
                    <th {...stylex.props(styles.th)}>{t('colWhen')}</th>
                    {/* The branch is on the ROW here, unlike the aggregate views: the
                        ledger really does mix branches, so the column changes down the
                        page and earns its place. */}
                    <th {...stylex.props(styles.th)}>{t('colBranch')}</th>
                    <th {...stylex.props(styles.th)}>{t('colPosition')}</th>
                    <th {...stylex.props(styles.th)}>{t('colReason')}</th>
                    <th {...stylex.props(styles.th, styles.num)}>{t('colChange')}</th>
                    {/* Not the gym-wide figure the table above shows: this is what the
                        row's own branch held afterwards. */}
                    <th {...stylex.props(styles.th, styles.num)}>{t('colLeftAtBranch')}</th>
                    <th {...stylex.props(styles.th)}>{t('colBy')}</th>
                    <th {...stylex.props(styles.th)}>{t('colNote')}</th>
                  </tr>
                </thead>
                <tbody>
                  {movements.map((movement) => (
                    <tr key={movement.id}>
                      <td {...stylex.props(styles.td, styles.muted)}>
                        {dtf.format(new Date(movement.createdAt))}
                      </td>
                      {/* A movement with no branch is a row written before per-branch
                          stock existed, or one whose branch has since been retired.
                          Both are facts worth stating; neither is a blank cell. */}
                      <td
                        {...stylex.props(styles.td, movement.locationName === null && styles.muted)}
                      >
                        {movement.locationName ?? t('noBranchRecorded')}
                      </td>
                      <td {...stylex.props(styles.td)}>
                        {movement.variantIndex === null ? product.name : movement.variantLabel}
                      </td>
                      <td {...stylex.props(styles.td)}>
                        {t(`reasons.${REASON_KEYS[movement.reason]}`)}
                      </td>
                      <td
                        {...stylex.props(
                          styles.td,
                          styles.num,
                          movement.delta > 0 ? styles.deltaUp : styles.deltaDown,
                        )}
                      >
                        {movement.delta > 0
                          ? `+${nf.format(movement.delta)}`
                          : nf.format(movement.delta)}
                      </td>
                      <td {...stylex.props(styles.td, styles.num)}>
                        {nf.format(movement.resultingStock)}
                      </td>
                      <td {...stylex.props(styles.td, styles.muted)}>
                        {movement.actorName ?? (movement.orderId ? t('checkoutActor') : '-')}
                      </td>
                      <td {...stylex.props(styles.td, styles.muted)}>{movement.note || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>

          {branchName === null ? null : (
            <p {...stylex.props(styles.note)}>{t('branchOnlyNote', { branch: branchName })}</p>
          )}
        </>
      ) : null}
    </section>
  );
}
