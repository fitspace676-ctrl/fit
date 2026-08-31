import Link from 'next/link';
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
import { createDateTimeFormat, defaultLocale } from '@fit/i18n';

/** How each ledger reason reads to staff, and the tone its delta wears. */
const REASON_LABELS: Record<StockMovementReason, string> = {
  RECEIVE: 'Delivery',
  ADJUSTMENT: 'Correction',
  RECOUNT: 'Recount',
  WRITE_OFF: 'Write-off',
  SALE: 'Sale',
  REFUND_RESTOCK: 'Refund',
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

/** The badge each derived level wears beside a position's count. */
const LEVEL_TONES: Record<string, { label: string; tone: BadgeTone }> = {
  untracked: { label: 'Not tracked', tone: 'neutral' },
  out: { label: 'Out', tone: 'danger' },
  low: { label: 'Low', tone: 'pending' },
  in: { label: 'In stock', tone: 'positive' },
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
export function StockPanel({
  product,
  movements,
  canWrite,
  branchName,
}: {
  product: GetAdminProductResponse;
  movements: StockMovementRow[];
  canWrite: boolean;
  /** The console's active branch, or `null` in "All locations" mode. */
  branchName: string | null;
}) {
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

  return (
    <section {...stylex.props(styles.section)}>
      <div {...stylex.props(styles.headRow)}>
        <h2 {...stylex.props(styles.heading)}>Inventory</h2>
        <span {...stylex.props(styles.subtle)}>
          Low-stock alert at {threshold}
          {product.lowStockThreshold === null ? ' (default)' : ''}
        </span>
      </div>

      <Card padding="none" xstyle={styles.card}>
        <table {...stylex.props(styles.table)}>
          <thead>
            <tr>
              <th {...stylex.props(styles.th)}>Position</th>
              <th {...stylex.props(styles.th)}>SKU</th>
              <th {...stylex.props(styles.th, styles.num)}>On hand (all branches)</th>
              <th {...stylex.props(styles.th)}>Status</th>
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
                    {position.stock === null ? '-' : position.stock}
                  </td>
                  <td {...stylex.props(styles.td)}>
                    <Badge tone={badge.tone} label={badge.label} />
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
        These are gym-wide totals. For one branch’s shelf — and to record a stocktake against it —
        open{' '}
        <Link href="/shop/inventory" {...stylex.props(styles.link)}>
          Inventory
        </Link>
        .
      </p>

      <div {...stylex.props(styles.headRow)}>
        <h2 {...stylex.props(styles.heading)}>Stock history</h2>
        <span {...stylex.props(styles.subtle)}>
          {branchName === null ? 'Most recent first' : `${branchName} · most recent first`}
        </span>
      </div>

      <Card padding="none" xstyle={styles.card}>
        {movements.length === 0 ? (
          <p {...stylex.props(styles.empty)}>
            No movements recorded yet. Adjustments, sales and refunds will appear here.
          </p>
        ) : (
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                <th {...stylex.props(styles.th)}>When</th>
                {/* The branch is on the ROW here, unlike the aggregate views: the
                    ledger really does mix branches, so the column changes down the
                    page and earns its place. */}
                <th {...stylex.props(styles.th)}>Branch</th>
                <th {...stylex.props(styles.th)}>Position</th>
                <th {...stylex.props(styles.th)}>Reason</th>
                <th {...stylex.props(styles.th, styles.num)}>Change</th>
                {/* Not the gym-wide figure the table above shows: this is what the
                    row's own branch held afterwards. */}
                <th {...stylex.props(styles.th, styles.num)}>Left at branch</th>
                <th {...stylex.props(styles.th)}>By</th>
                <th {...stylex.props(styles.th)}>Note</th>
              </tr>
            </thead>
            <tbody>
              {movements.map((movement) => (
                <tr key={movement.id}>
                  <td {...stylex.props(styles.td, styles.muted)}>
                    {createDateTimeFormat(defaultLocale, {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    }).format(new Date(movement.createdAt))}
                  </td>
                  {/* A movement with no branch is a row written before per-branch
                      stock existed, or one whose branch has since been retired.
                      Both are facts worth stating; neither is a blank cell. */}
                  <td {...stylex.props(styles.td, movement.locationName === null && styles.muted)}>
                    {movement.locationName ?? 'No branch recorded'}
                  </td>
                  <td {...stylex.props(styles.td)}>
                    {movement.variantIndex === null ? product.name : movement.variantLabel}
                  </td>
                  <td {...stylex.props(styles.td)}>{REASON_LABELS[movement.reason]}</td>
                  <td
                    {...stylex.props(
                      styles.td,
                      styles.num,
                      movement.delta > 0 ? styles.deltaUp : styles.deltaDown,
                    )}
                  >
                    {movement.delta > 0 ? '+' : ''}
                    {movement.delta}
                  </td>
                  <td {...stylex.props(styles.td, styles.num)}>{movement.resultingStock}</td>
                  <td {...stylex.props(styles.td, styles.muted)}>
                    {movement.actorName ?? (movement.orderId ? 'Checkout' : '-')}
                  </td>
                  <td {...stylex.props(styles.td, styles.muted)}>{movement.note || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      {branchName === null ? null : (
        <p {...stylex.props(styles.note)}>
          Movements at {branchName} only. Rows recorded before stock was held per branch name no
          branch, and are listed under All locations.
        </p>
      )}
    </section>
  );
}
