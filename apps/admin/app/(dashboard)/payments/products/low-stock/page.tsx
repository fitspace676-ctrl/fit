import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  Permission,
  lowStockQuerySchema,
  roleHasPermission,
  type ListLowStockResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLowStockProducts } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Icon, type IconName } from '@/components/ui';
import { StockAdjuster } from './stock-adjuster';

export const metadata: Metadata = {
  title: 'Inventory · Low stock — Fit Admin',
  description:
    'The gym’s inventory alerts: every active product carrying a variant at or below the reorder threshold, most urgent first, with a one-tap stock adjustment so staff can restock before a line sells out.',
};

// The alerts reflect live on-hand stock and the staff session token, so the page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** The reorder cushions the page offers as one-tap threshold presets. */
const THRESHOLD_PRESETS = [3, 5, 10, 20] as const;

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
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
  thresholdRow: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
  },
  thresholdLabel: {
    marginRight: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  presetPill: {
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'transparent',
      ':hover': 'var(--color-background-muted)',
    },
    paddingInline: '0.75rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-secondary)',
  },
  presetPillActive: {
    borderRadius: 'var(--radius-full)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-accent)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.75rem',
    paddingBlock: '0.25rem',
    fontSize: '0.75rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  tileGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, 1fr)',
    gap: '1rem',
  },
  tile: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    padding: {
      default: '1rem',
      '@media (min-width: 640px)': '1.25rem',
    },
  },
  tileIcon: {
    width: '1.25rem',
    height: '1.25rem',
  },
  tileValue: {
    marginTop: '0.75rem',
    fontFamily: 'var(--font-family-heading)',
    fontSize: '1.5rem',
    fontWeight: 800,
    letterSpacing: '-0.025em',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  tileLabel: {
    marginTop: '0.25rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--color-text-secondary)',
  },
  toneBrand: {
    color: 'var(--color-text-accent)',
  },
  toneDanger: {
    color: 'var(--color-error)',
  },
  toneWarning: {
    color: 'var(--color-warning)',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  errorIcon: {
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
  },
  emptyCard: {
    paddingInline: '1rem',
    paddingBlock: '2rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  tableCard: {
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    fontSize: '0.875rem',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  head: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'left',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  headRight: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  bodyRow: {
    borderBottomWidth: {
      default: '1px',
      ':last-child': 0,
    },
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  productCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  productLink: {
    textDecoration: {
      default: 'none',
      ':hover': 'underline',
    },
    color: {
      default: 'inherit',
      ':hover': 'var(--color-text-accent)',
    },
  },
  continuation: {
    color: 'var(--color-text-secondary)',
  },
  variantCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  skuCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-secondary)',
  },
  rightCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'right',
  },
  footRow: {
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
  },
  footCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
});

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** One inventory summary tile — a derived at-a-glance count over the whole report. */
type Tile = {
  key: string;
  label: string;
  icon: IconName;
  tone: stylex.StyleXStyles;
  value: number;
};

/**
 * The inventory & low-stock view (T4.7), rebuilt on Astryx + brand-tokened StyleX
 * (T11.22). Server-renders `GET /admin/products/low-stock` keyed by an optional
 * `?threshold=` search param (defaulting to the shared
 * {@link DEFAULT_LOW_STOCK_THRESHOLD}) into an alert list, plus a summary of how deep
 * the shortfall runs and a per-variant **stock adjustment** entry point. The
 * `/payments/products` area already requires staff (middleware) and the API enforces
 * `ProductRead`, so the only failure handled here is the API call itself. Adjusting a
 * variant's on-hand count is a `ProductWrite` capability, so the inline adjuster is
 * shown only to staff who hold it; everyone can still jump to a product to edit it.
 */
export default async function LowStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = lowStockQuerySchema.safeParse(raw);
  const threshold = parsed.success ? parsed.data.threshold : DEFAULT_LOW_STOCK_THRESHOLD;

  // Adjusting stock is a write; read-only staff still see the report + product links.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  let report: ListLowStockResponse | null = null;
  let error: string | null = null;
  try {
    report = await fetchLowStockProducts(threshold);
  } catch (caught) {
    error =
      caught instanceof ApiError
        ? `Could not load low-stock alerts (${caught.status}): ${caught.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
  }

  // Tiles only earn their space when something is actually low; the all-clear
  // state below carries the "you're all stocked up" message on its own.
  const tiles = report !== null && report.data.length > 0 ? summarize(report) : null;
  const colSpan = canWrite ? 5 : 4;

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Inventory</h1>
          <p {...stylex.props(styles.subtitle)}>
            Active products with a variant at or below {threshold} on hand, most urgent first.
            Restock before a line sells out — adjust a variant’s on-hand count inline, or open the
            product to edit it in full.
          </p>
        </div>
        <Link href="/payments/products" {...stylex.props(styles.outlineLink)}>
          All products
        </Link>
      </header>

      <div {...stylex.props(styles.thresholdRow)}>
        <span {...stylex.props(styles.thresholdLabel)}>Threshold</span>
        {THRESHOLD_PRESETS.map((preset) => {
          const active = preset === threshold;
          return (
            <Link
              key={preset}
              href={
                preset === DEFAULT_LOW_STOCK_THRESHOLD
                  ? '/payments/products/low-stock'
                  : `?threshold=${preset}`
              }
              aria-current={active ? 'page' : undefined}
              {...stylex.props(active ? styles.presetPillActive : styles.presetPill)}
            >
              ≤ {preset}
            </Link>
          );
        })}
      </div>

      {tiles !== null ? (
        <div {...stylex.props(styles.tileGrid)}>
          {tiles.map((tile) => (
            <Card key={tile.key} variant="default" padding={0} xstyle={styles.tile}>
              <Icon name={tile.icon} {...stylex.props(styles.tileIcon, tile.tone)} />
              <div {...stylex.props(styles.tileValue)}>{tile.value.toLocaleString()}</div>
              <div {...stylex.props(styles.tileLabel)}>{tile.label}</div>
            </Card>
          ))}
        </div>
      ) : null}

      {error !== null ? (
        <Card role="alert" variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{error}</span>
        </Card>
      ) : report !== null && report.data.length === 0 ? (
        <Card variant="default" padding={0} xstyle={styles.emptyCard}>
          Nothing is low on stock at or below {threshold} units. You’re all stocked up.
        </Card>
      ) : report !== null ? (
        <Card variant="default" padding={0} xstyle={styles.tableCard}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr {...stylex.props(styles.headRow)}>
                <th {...stylex.props(styles.head)}>Product</th>
                <th {...stylex.props(styles.head)}>Variant</th>
                <th {...stylex.props(styles.head)}>SKU</th>
                <th {...stylex.props(styles.headRight)}>On hand</th>
                {canWrite ? (
                  <th {...stylex.props(styles.headRight)}>
                    <span {...stylex.props(styles.srOnly)}>Adjust stock</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {report.data.flatMap((product) =>
                product.variants.map((variant, index) => (
                  <tr
                    key={`${product.id}:${variant.variantIndex}`}
                    {...stylex.props(styles.bodyRow)}
                  >
                    <td {...stylex.props(styles.productCell)}>
                      {index === 0 ? (
                        <Link
                          href={`/payments/products/${product.id}`}
                          {...stylex.props(styles.productLink)}
                        >
                          {product.name}
                        </Link>
                      ) : (
                        <span {...stylex.props(styles.continuation)}>↳</span>
                      )}
                    </td>
                    <td {...stylex.props(styles.variantCell)}>{variant.name}</td>
                    <td {...stylex.props(styles.skuCell)}>{variant.sku || '—'}</td>
                    <td {...stylex.props(styles.rightCell)}>
                      <Badge tone={variant.stock === 0 ? 'danger' : 'warning'}>
                        {variant.stock === 0 ? 'Out of stock' : variant.stock}
                      </Badge>
                    </td>
                    {canWrite ? (
                      <td {...stylex.props(styles.rightCell)}>
                        <StockAdjuster
                          productId={product.id}
                          productName={product.name}
                          variantIndex={variant.variantIndex}
                          variantName={variant.name}
                          sku={variant.sku}
                          stock={variant.stock}
                        />
                      </td>
                    ) : null}
                  </tr>
                )),
              )}
            </tbody>
            <tfoot>
              <tr {...stylex.props(styles.footRow)}>
                <td colSpan={colSpan} {...stylex.props(styles.footCell)}>
                  {report.data.length.toLocaleString()} product
                  {report.data.length === 1 ? '' : 's'} at or below {threshold} on hand.
                </td>
              </tr>
            </tfoot>
          </table>
        </Card>
      ) : null}
    </div>
  );
}

/**
 * Fold the low-stock report into three at-a-glance counts: products carrying at
 * least one low variant, individual variants that are fully out (`0`), and variants
 * still holding a thinning-but-nonzero count. Every variant on the report is at or
 * below the threshold, so the two variant buckets partition the flat list.
 */
function summarize(report: ListLowStockResponse): Tile[] {
  const variants = report.data.flatMap((product) => product.variants);
  const outOfStock = variants.filter((variant) => variant.stock === 0).length;
  const running = variants.length - outOfStock;

  return [
    {
      key: 'products',
      label: 'Products affected',
      icon: 'bag',
      tone: styles.toneBrand,
      value: report.data.length,
    },
    {
      key: 'out',
      label: 'Out of stock',
      icon: 'info',
      tone: styles.toneDanger,
      value: outOfStock,
    },
    {
      key: 'low',
      label: 'Running low',
      icon: 'flame',
      tone: styles.toneWarning,
      value: running,
    },
  ];
}
