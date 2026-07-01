import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  lowStockQuerySchema,
  type ListLowStockResponse,
} from '@fit/types';
import { ApiError, fetchLowStockProducts } from '@/lib/api';
import { Badge, Card, Icon, buttonClasses } from '@/components/ui';

export const metadata: Metadata = {
  title: 'Low stock — Fit Admin',
  description:
    'The gym’s low-stock alerts: every active product carrying a variant at or below the reorder threshold, most urgent first, so staff can restock before a line sells out.',
};

// The alerts reflect live on-hand stock and the staff session token, so the page
// must never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The low-stock alerts report (T7.8). Server-renders `GET /admin/products/low-stock`
 * keyed by an optional `?threshold=` search param (defaulting to the shared
 * {@link DEFAULT_LOW_STOCK_THRESHOLD}). The `/products` area already requires staff
 * (middleware) and the API enforces `ProductRead`, so the only failure handled here
 * is the API call itself. Each low variant links back to its product's edit form so
 * staff can adjust the on-hand count in one hop.
 */
export default async function LowStockPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = lowStockQuerySchema.safeParse(raw);
  const threshold = parsed.success ? parsed.data.threshold : DEFAULT_LOW_STOCK_THRESHOLD;

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

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Low stock
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
            Active products with a variant at or below {threshold} on hand, most urgent first.
            Restock before a line sells out — open a product to adjust its variant stock.
          </p>
        </div>
        <Link href="/products" className={buttonClasses('outline', 'md')}>
          All products
        </Link>
      </header>

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
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Product
                </th>
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  Variant
                </th>
                <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  SKU
                </th>
                <th className="px-4 py-3 text-right font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                  On hand
                </th>
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
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </Card>
      ) : null}
    </div>
  );
}
