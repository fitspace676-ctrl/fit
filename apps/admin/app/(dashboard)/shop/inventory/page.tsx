import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  inventoryQuerySchema,
  resolveStockLevel,
  roleHasPermission,
  type InventoryPositionRow,
  type ListInventoryResponse,
} from '@fit/types';
import { Card } from '@astryxdesign/core/Card';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchInventory } from '@/lib/api';
import { Badge, Icon, type Tone } from '@/components/ui';
import { formatPrice } from '../format-price';
import { StockAdjuster } from '../low-stock/stock-adjuster';

export const metadata: Metadata = {
  title: 'Inventory - Fit Admin',
  description:
    'What the gym stocks and how much of each: every product’s on-hand count, its status against the reorder threshold, and the value sitting on the shelf.',
};

// Counts are live and the page is gated on the staff session, so it must never be
// statically rendered or cached.
export const dynamic = 'force-dynamic';

/** The badge each derived level wears in the table. */
const LEVEL_BADGES: Record<string, { label: string; tone: Tone }> = {
  untracked: { label: 'Not tracked', tone: 'ink' },
  out: { label: 'Out', tone: 'danger' },
  low: { label: 'Low', tone: 'warning' },
  in: { label: 'In stock', tone: 'success' },
};

const styles = stylex.create({
  page: { display: 'flex', flexDirection: 'column', gap: '1.5rem' },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: { display: 'flex', flexDirection: 'column', gap: '0.25rem' },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  outlineLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
  },
  linkIcon: { width: '1rem', height: '1rem' },
  tiles: {
    display: 'grid',
    gap: '0.75rem',
    gridTemplateColumns: 'repeat(auto-fit, minmax(11rem, 1fr))',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    padding: '1rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'var(--color-background-surface)',
  },
  tileLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: 'var(--color-text-secondary)',
  },
  tileValue: {
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    color: 'var(--color-text-primary)',
    fontVariantNumeric: 'tabular-nums',
  },
  tileHint: { fontSize: '0.75rem', color: 'var(--color-text-secondary)' },
  card: { overflowX: 'auto' },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' },
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
    whiteSpace: 'nowrap',
  },
  td: {
    paddingInline: '1rem',
    paddingBlock: '0.625rem',
    borderBlockEndWidth: '1px',
    borderBlockEndStyle: 'solid',
    borderBlockEndColor: 'var(--color-border)',
    color: 'var(--color-text-primary)',
    verticalAlign: 'middle',
  },
  num: { textAlign: 'end', fontVariantNumeric: 'tabular-nums' },
  actionCell: { textAlign: 'end', width: '1%', whiteSpace: 'nowrap' },
  productLink: {
    color: 'var(--color-text-primary)',
    textDecoration: 'none',
    fontWeight: 600,
  },
  muted: { color: 'var(--color-text-secondary)' },
  empty: {
    margin: 0,
    padding: '1.5rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    color: 'var(--color-error)',
  },
  errorIcon: { width: '1.25rem', height: '1.25rem', flexShrink: 0 },
});

/**
 * The inventory overview: what the gym stocks and how much of each.
 *
 * Where the low-stock report answers "what needs reordering", this is the view for
 * a stocktake — every product's addressable positions with their on-hand counts,
 * the status each derives to, and the capital sitting on the shelf. A product with
 * variants lists one row per variant; one sold as-is lists a single row.
 *
 * Counts read `—` rather than `0` when a position is not tracked, because those
 * are different facts: nobody has counted it, as opposed to it being empty. The
 * value total says how many positions it could actually price, so a catalogue with
 * missing costs shows a visibly partial figure instead of an understated one
 * passing as complete.
 */
export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const query = inventoryQuerySchema.parse({
    page: raw.page,
    limit: raw.limit,
    search: typeof raw.search === 'string' ? raw.search : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    tracked: typeof raw.tracked === 'string' ? raw.tracked : undefined,
  });

  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  let result: ListInventoryResponse;
  try {
    result = await fetchInventory(query);
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load the inventory (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div {...stylex.props(styles.page)}>
        <Card role="alert" variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{message}</span>
        </Card>
      </div>
    );
  }

  const { data, summary } = result;

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Inventory</h1>
          <p {...stylex.props(styles.subtitle)}>
            What you stock and how much of each. Adjust a count here and it is recorded with a
            reason, so the product’s history explains the number.
          </p>
        </div>
        <Link href="/shop/low-stock" {...stylex.props(styles.outlineLink)}>
          <Icon name="info" sw={2} {...stylex.props(styles.linkIcon)} />
          Low stock
        </Link>
      </header>

      <div {...stylex.props(styles.tiles)}>
        <Tile label="Units on hand" value={String(summary.totalUnits)} />
        <Tile
          label="Tracked positions"
          value={String(summary.trackedCount)}
          hint={`of ${summary.positionCount} total`}
        />
        <Tile label="Low" value={String(summary.lowCount)} />
        <Tile label="Out" value={String(summary.outCount)} />
        <Tile
          label="Stock value"
          value={formatPrice(summary.totalValue, summary.currency)}
          hint={
            summary.valuedPositions < summary.trackedCount
              ? `${summary.valuedPositions} of ${summary.trackedCount} priced`
              : undefined
          }
        />
      </div>

      <Card variant="default" padding={0} xstyle={styles.card}>
        {data.length === 0 ? (
          <p {...stylex.props(styles.empty)}>Nothing to show. Add a product to start counting.</p>
        ) : (
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr>
                <th {...stylex.props(styles.th)}>Product</th>
                <th {...stylex.props(styles.th)}>Position</th>
                <th {...stylex.props(styles.th)}>SKU</th>
                <th {...stylex.props(styles.th, styles.num)}>On hand</th>
                <th {...stylex.props(styles.th)}>Status</th>
                <th {...stylex.props(styles.th, styles.num)}>Value</th>
                {canWrite ? <th {...stylex.props(styles.th)} /> : null}
              </tr>
            </thead>
            <tbody>
              {data.map((position) => (
                <PositionRow
                  key={`${position.productId}:${position.variantIndex ?? 'base'}`}
                  position={position}
                  canWrite={canWrite}
                />
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}

function Tile({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div {...stylex.props(styles.tile)}>
      <span {...stylex.props(styles.tileLabel)}>{label}</span>
      <span {...stylex.props(styles.tileValue)}>{value}</span>
      {hint ? <span {...stylex.props(styles.tileHint)}>{hint}</span> : null}
    </div>
  );
}

function PositionRow({
  position,
  canWrite,
}: {
  position: InventoryPositionRow;
  canWrite: boolean;
}) {
  const level = resolveStockLevel({
    lowestStock: position.stock,
    lowStockThreshold: position.lowStockThreshold,
  });
  const badge = LEVEL_BADGES[level]!;

  return (
    <tr>
      <td {...stylex.props(styles.td)}>
        <Link href={`/shop/${position.productId}`} {...stylex.props(styles.productLink)}>
          {position.productName}
        </Link>
      </td>
      <td {...stylex.props(styles.td, styles.muted)}>
        {position.variantIndex === null ? '—' : position.label}
      </td>
      <td {...stylex.props(styles.td, styles.muted)}>{position.sku || '—'}</td>
      <td {...stylex.props(styles.td, styles.num)}>
        {position.stock === null ? '—' : position.stock}
      </td>
      <td {...stylex.props(styles.td)}>
        <Badge tone={badge.tone}>{badge.label}</Badge>
      </td>
      <td {...stylex.props(styles.td, styles.num, styles.muted)}>
        {position.value === null ? '—' : formatPrice(position.value, position.currency)}
      </td>
      {canWrite ? (
        <td {...stylex.props(styles.td, styles.actionCell)}>
          <StockAdjuster
            productId={position.productId}
            productName={position.productName}
            variantIndex={position.variantIndex}
            variantName={position.variantIndex === null ? position.productName : position.label}
            sku={position.sku}
            stock={position.stock ?? 0}
          />
        </td>
      ) : null}
    </tr>
  );
}
