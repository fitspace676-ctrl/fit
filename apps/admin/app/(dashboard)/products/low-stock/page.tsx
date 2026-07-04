import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  Permission,
  lowStockQuerySchema,
  roleHasPermission,
  type ListLowStockResponse,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchLowStockProducts } from '@/lib/api';
import { Badge, Card, Icon, type IconName, buttonClasses } from '@/components/ui';
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

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** One inventory summary tile — a derived at-a-glance count over the whole report. */
type Tile = { key: string; label: string; icon: IconName; tone: string; value: number };

/**
 * The inventory & low-stock view (T4.7). Server-renders `GET /admin/products/low-stock`
 * keyed by an optional `?threshold=` search param (defaulting to the shared
 * {@link DEFAULT_LOW_STOCK_THRESHOLD}) into an alert list, plus a summary of how deep
 * the shortfall runs and a per-variant **stock adjustment** entry point. The
 * `/products` area already requires staff (middleware) and the API enforces
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
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Inventory
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
            Active products with a variant at or below {threshold} on hand, most urgent first.
            Restock before a line sells out — adjust a variant’s on-hand count inline, or open the
            product to edit it in full.
          </p>
        </div>
        <Link href="/products" className={buttonClasses('outline', 'md')}>
          All products
        </Link>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-400">
          Threshold
        </span>
        {THRESHOLD_PRESETS.map((preset) => {
          const active = preset === threshold;
          return (
            <Link
              key={preset}
              href={
                preset === DEFAULT_LOW_STOCK_THRESHOLD
                  ? '/products/low-stock'
                  : `?threshold=${preset}`
              }
              aria-current={active ? 'page' : undefined}
              className={`rounded-pill px-3 py-1 text-xs font-semibold ring-1 ring-inset transition ${
                active
                  ? 'bg-brand-500/15 text-brand-700 ring-brand-500/40 dark:bg-brand-500/20 dark:text-brand-200 dark:ring-brand-400/40'
                  : 'text-ink-600 ring-ink-200 hover:bg-ink-50 dark:text-ink-300 dark:ring-white/10 dark:hover:bg-white/[0.04]'
              }`}
            >
              ≤ {preset}
            </Link>
          );
        })}
      </div>

      {tiles !== null ? (
        <div className="grid grid-cols-3 gap-4">
          {tiles.map((tile) => (
            <Card key={tile.key} glow className="p-4 sm:p-5">
              <Icon name={tile.icon} className={`h-5 w-5 ${tile.tone}`} />
              <div className="mt-3 font-display text-2xl font-extrabold tracking-tight tabular-nums text-ink-900 dark:text-white">
                {tile.value.toLocaleString()}
              </div>
              <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500 dark:text-ink-400">
                {tile.label}
              </div>
            </Card>
          ))}
        </div>
      ) : null}

      {error !== null ? (
        <Card
          role="alert"
          className="flex items-center gap-3 p-4 text-sm text-danger-700 dark:text-danger-300"
        >
          <Icon name="info" className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </Card>
      ) : report !== null && report.data.length === 0 ? (
        <Card className="px-4 py-8 text-sm text-ink-500 dark:text-ink-400">
          Nothing is low on stock at or below {threshold} units. You’re all stocked up.
        </Card>
      ) : report !== null ? (
        <Card className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-white/10">
                <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Product
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Variant
                </th>
                <th className="px-4 py-3 text-left font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  SKU
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  On hand
                </th>
                {canWrite ? (
                  <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    <span className="sr-only">Adjust stock</span>
                  </th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {report.data.flatMap((product) =>
                product.variants.map((variant, index) => (
                  <tr
                    key={`${product.id}:${variant.variantIndex}`}
                    className="border-b border-ink-50 last:border-b-0 dark:border-white/5"
                  >
                    <td className="px-4 py-3 font-medium text-ink-900 dark:text-white">
                      {index === 0 ? (
                        <Link
                          href={`/products/${product.id}`}
                          className="hover:text-brand-700 hover:underline dark:hover:text-brand-300"
                        >
                          {product.name}
                        </Link>
                      ) : (
                        <span className="text-ink-400">↳</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-ink-600 dark:text-ink-300">{variant.name}</td>
                    <td className="px-4 py-3 font-mono tabular-nums text-ink-500 dark:text-ink-400">
                      {variant.sku || '—'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Badge tone={variant.stock === 0 ? 'danger' : 'warning'}>
                        {variant.stock === 0 ? 'Out of stock' : variant.stock}
                      </Badge>
                    </td>
                    {canWrite ? (
                      <td className="px-4 py-3 text-right">
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
              <tr className="border-t border-ink-100 dark:border-white/10">
                <td
                  colSpan={colSpan}
                  className="px-4 py-3 text-[11px] text-ink-400 dark:text-ink-500"
                >
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
      tone: 'text-brand-500 dark:text-brand-300',
      value: report.data.length,
    },
    {
      key: 'out',
      label: 'Out of stock',
      icon: 'info',
      tone: 'text-danger-600 dark:text-danger-300',
      value: outOfStock,
    },
    {
      key: 'low',
      label: 'Running low',
      icon: 'flame',
      tone: 'text-warning-600 dark:text-warning-300',
      value: running,
    },
  ];
}
