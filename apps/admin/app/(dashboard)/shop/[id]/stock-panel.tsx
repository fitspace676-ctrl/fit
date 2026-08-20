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
 * The product's inventory: what is on hand at each position, and the ledger of how
 * it got there.
 *
 * A product tracks stock one of two ways, so the table shows whichever applies —
 * one row per variant, or a single row for the product sold as-is. An untracked
 * product still gets its row, with an Adjust button: recording a delivery is how a
 * gym starts counting something, and hiding the control would leave no way in.
 *
 * The history below is the answer to "why is this 3?". Sales and refunds appear
 * alongside manual corrections because the checkout writes to the same ledger, so
 * a drop between two stocktakes is explained rather than mysterious.
 */
export function StockPanel({
  product,
  movements,
  canWrite,
}: {
  product: GetAdminProductResponse;
  movements: StockMovementRow[];
  canWrite: boolean;
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
              <th {...stylex.props(styles.th, styles.num)}>On hand</th>
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
                      <StockAdjuster
                        productId={product.id}
                        productName={product.name}
                        variantIndex={position.variantIndex}
                        variantName={position.label}
                        sku={position.sku}
                        stock={position.stock ?? 0}
                      />
                    </td>
                  ) : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <div {...stylex.props(styles.headRow)}>
        <h2 {...stylex.props(styles.heading)}>Stock history</h2>
        <span {...stylex.props(styles.subtle)}>Most recent first</span>
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
                <th {...stylex.props(styles.th)}>Position</th>
                <th {...stylex.props(styles.th)}>Reason</th>
                <th {...stylex.props(styles.th, styles.num)}>Change</th>
                <th {...stylex.props(styles.th, styles.num)}>Left</th>
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
    </section>
  );
}
