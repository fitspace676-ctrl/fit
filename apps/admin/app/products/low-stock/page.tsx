import type { Metadata } from 'next';
import Link from 'next/link';
import {
  DEFAULT_LOW_STOCK_THRESHOLD,
  lowStockQuerySchema,
  type ListLowStockResponse,
} from '@fit/types';
import { ApiError, fetchLowStockProducts } from '@/lib/api';

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
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Low stock</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Active products with a variant at or below {threshold} on hand, most urgent first.
            Restock before a line sells out — open a product to adjust its variant stock.
          </p>
        </div>
        <Link
          href="/products"
          className="rounded-card border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          All products
        </Link>
      </header>

      {error !== null ? (
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : report !== null && report.data.length === 0 ? (
        <p className="rounded-card border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
          Nothing is low on stock at or below {threshold} units. You’re all stocked up.
        </p>
      ) : report !== null ? (
        <section className="overflow-hidden rounded-card border border-slate-200">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2 font-medium">Product</th>
                <th className="px-4 py-2 font-medium">Variant</th>
                <th className="px-4 py-2 font-medium">SKU</th>
                <th className="px-4 py-2 text-right font-medium">On hand</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {report.data.flatMap((product) =>
                product.variants.map((variant, index) => (
                  <tr key={`${product.id}:${variant.variantIndex}`}>
                    <td className="px-4 py-2 font-medium text-slate-900">
                      {index === 0 ? (
                        <Link href={`/products/${product.id}`} className="hover:underline">
                          {product.name}
                        </Link>
                      ) : (
                        <span className="text-slate-400">↳</span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{variant.name}</td>
                    <td className="px-4 py-2 tabular-nums text-slate-500">{variant.sku || '—'}</td>
                    <td className="px-4 py-2 text-right">
                      <span
                        className={
                          variant.stock === 0
                            ? 'rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-red-700'
                            : 'rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-amber-700'
                        }
                      >
                        {variant.stock === 0 ? 'Out of stock' : variant.stock}
                      </span>
                    </td>
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </section>
      ) : null}
    </div>
  );
}
