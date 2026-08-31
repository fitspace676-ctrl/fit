import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  lowStockQuerySchema,
  roleHasPermission,
  type ListLowStockResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLowStockProducts } from '@/lib/api';
import { fetchActiveLocations, getActiveLocationId } from '@/lib/active-location-server';
import { Badge, Card } from '@fit/ui-kit';
import { Icon, type IconName } from '@/components/ui';
import { StockAdjuster } from './stock-adjuster';
import { ThresholdPicker } from './threshold-picker';
import { createNumberFormat, defaultLocale } from '@fit/i18n';

export const metadata: Metadata = {
  title: 'Inventory · Low stock - FormaCore Admin',
  description:
    'The gym’s inventory alerts: every active product carrying a variant at or below the reorder threshold, most urgent first, with a one-tap stock adjustment so staff can restock before a line sells out.',
};

// The alerts reflect live on-hand stock and the staff session token, so the page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

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
  scope: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  scopeLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  scopeValue: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  scopeCaveat: {
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
  },
  thresholdCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    textAlign: 'right',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
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
 * (T11.22), per-branch since Stage 4 of multi-branch. Server-renders
 * `GET /admin/products/low-stock` into an alert list, plus a summary of how deep
 * the shortfall runs and a per-variant **stock adjustment** entry point. The
 * `/shop` area already requires staff (middleware) and the API enforces
 * `ProductRead`, so the only failure handled here is the API call itself. Adjusting a
 * variant's on-hand count is a `ProductWrite` capability, so the inline adjuster is
 * shown only to staff who hold it; everyone can still jump to a product to edit it.
 *
 * ## Two thresholds, and why the page can only name one of them
 *
 * `?threshold=` is now an explicit OVERRIDE, not the report's default. Omitted —
 * the bare page — every position is judged against its own cushion, resolved
 * through three rungs: this line at this branch, then this line everywhere, then
 * the gym default. Two variants of one product can therefore trip at different
 * numbers, so there is no single figure the header could honestly print. It says
 * "each line's own reorder point" instead, and the per-position number lives in
 * its own column where it varies row by row as it actually does. Only when the
 * override is set does one number apply to everything, and only then is it stated.
 *
 * The response's `threshold` — not the request's — decides which of those two the
 * page says, so the wording can never disagree with the report underneath it.
 */
export default async function LowStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  // Only the threshold is read off the raw params here — the branch comes from
  // `getActiveLocationId`, which reconciles the cookie with the URL. Handing the
  // whole bag to one schema would let a malformed `?locationId=` (a repeated key
  // arrives as an array) fail the parse and silently discard a perfectly good
  // threshold alongside it.
  const parsed = lowStockQuerySchema.safeParse({
    threshold: typeof raw.threshold === 'string' ? raw.threshold : undefined,
  });
  // `undefined` is a meaningful value now, not a missing one: it asks the API to
  // judge each line against its own cushion rather than one flat ceiling.
  const threshold = parsed.success ? parsed.data.threshold : undefined;

  const [locationId, locations] = await Promise.all([
    getActiveLocationId(raw),
    fetchActiveLocations(),
  ]);

  // Adjusting stock is a write; read-only staff still see the report + product links.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  let report: ListLowStockResponse | null = null;
  let error: string | null = null;
  try {
    report = await fetchLowStockProducts(threshold, locationId);
  } catch (caught) {
    error =
      caught instanceof ApiError
        ? `Could not load low-stock alerts (${caught.status}): ${caught.message}`
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
  }

  // THE SCOPE IS READ BACK OFF THE REPORT, NEVER OFF THE REQUEST. The response
  // names the branch it was built for, so the strip below states what the numbers
  // are actually about rather than what the page asked for. That matters right now
  // because `fetchLowStockProducts` in `lib/api.ts` still takes a bare threshold
  // and has no way to carry `locationId` — so under a branch selection the report
  // comes back gym-wide, and the page says so instead of mislabelling it. When the
  // fetcher grows the param the caveat disappears on its own, with no edit here.
  const reportLocationId = report?.locationId ?? null;
  const reportedBranch = report === null ? null : (report.locationName ?? report.locationId);
  const activeBranchName = locationId
    ? (locations.find((location) => location.id === locationId)?.name ?? locationId)
    : null;
  const branchNotApplied =
    report !== null && locationId !== undefined && report.locationId === null;

  // Tiles only earn their space when something is actually low; the all-clear
  // state below carries the "you're all stocked up" message on its own.
  const tiles = report !== null && report.data.length > 0 ? summarize(report) : null;
  const colSpan = canWrite ? 6 : 5;
  // What the report was actually run at, as a phrase both the header and the
  // footer reuse so the two can never drift apart.
  const cushion =
    report === null || report.threshold === null
      ? 'each line’s own reorder point'
      : `${report.threshold} on hand`;

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Inventory</h1>
          <p {...stylex.props(styles.subtitle)}>
            Active products with a position at or below {cushion}, most urgent first. Restock before
            a line sells out - adjust a variant’s on-hand count inline, or open the product to edit
            it in full.
          </p>
          <p {...stylex.props(styles.scope)}>
            <span {...stylex.props(styles.scopeLabel)}>Location</span>
            <span {...stylex.props(styles.scopeValue)}>{reportedBranch ?? 'All locations'}</span>
            {branchNotApplied ? (
              <span {...stylex.props(styles.scopeCaveat)}>
                Not narrowed to {activeBranchName} — these are gym-wide totals
              </span>
            ) : reportedBranch === null ? (
              <span {...stylex.props(styles.scopeCaveat)}>
                Gym-wide totals, judged against each line’s product-level cushion
              </span>
            ) : null}
          </p>
        </div>
        <Link href="/shop" {...stylex.props(styles.outlineLink)}>
          All products
        </Link>
      </header>

      <ThresholdPicker threshold={threshold ?? null} />

      {tiles !== null ? (
        <div {...stylex.props(styles.tileGrid)}>
          {tiles.map((tile) => (
            <Card key={tile.key} padding="none" xstyle={styles.tile}>
              <Icon name={tile.icon} {...stylex.props(styles.tileIcon, tile.tone)} />
              <div {...stylex.props(styles.tileValue)}>
                {createNumberFormat(defaultLocale).format(tile.value)}
              </div>
              <div {...stylex.props(styles.tileLabel)}>{tile.label}</div>
            </Card>
          ))}
        </div>
      ) : null}

      {error !== null ? (
        <Card role="alert" padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{error}</span>
        </Card>
      ) : report !== null && report.data.length === 0 ? (
        <Card padding="none" xstyle={styles.emptyCard}>
          Nothing is at or below {cushion}
          {reportedBranch === null ? '' : ` at ${reportedBranch}`}. You’re all stocked up.
        </Card>
      ) : report !== null ? (
        <Card padding="none" xstyle={styles.tableCard}>
          <table {...stylex.props(styles.table)}>
            <thead>
              <tr {...stylex.props(styles.headRow)}>
                <th {...stylex.props(styles.head)}>Product</th>
                <th {...stylex.props(styles.head)}>Variant</th>
                <th {...stylex.props(styles.head)}>SKU</th>
                <th {...stylex.props(styles.headRight)}>
                  {reportedBranch === null
                    ? 'On hand (all branches)'
                    : `On hand at ${reportedBranch}`}
                </th>
                {/* The cushion is per position since Stage 4, so it gets a column
                    rather than a single number in the header that would be wrong
                    the moment two lines disagree. */}
                <th {...stylex.props(styles.headRight)}>Reorder at</th>
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
                        <Link href={`/shop/${product.id}`} {...stylex.props(styles.productLink)}>
                          {product.name}
                        </Link>
                      ) : (
                        <span {...stylex.props(styles.continuation)}>↳</span>
                      )}
                    </td>
                    <td {...stylex.props(styles.variantCell)}>{variant.name}</td>
                    <td {...stylex.props(styles.skuCell)}>{variant.sku || '-'}</td>
                    <td {...stylex.props(styles.rightCell)}>
                      <Badge
                        tone={variant.stock === 0 ? 'danger' : 'pending'}
                        label={variant.stock === 0 ? 'Out of stock' : variant.stock}
                      />
                    </td>
                    <td {...stylex.props(styles.thresholdCell)}>≤ {variant.threshold}</td>
                    {canWrite ? (
                      <td {...stylex.props(styles.rightCell)}>
                        <StockAdjuster
                          productId={product.id}
                          productName={product.name}
                          variantIndex={variant.variantIndex}
                          variantName={variant.name}
                          sku={variant.sku}
                          stock={variant.stock}
                          stockLocationId={reportLocationId}
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
                  {createNumberFormat(defaultLocale).format(report.data.length)} product
                  {report.data.length === 1 ? '' : 's'} at or below {cushion}
                  {reportedBranch === null ? '' : ` at ${reportedBranch}`}.
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
