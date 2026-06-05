'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminProductRow, ProductSort, ProductStatus, SortDir } from '@fit/types';
import { formatPrice } from './format-price';

/** Visual treatment per product status — green active, slate inactive. */
const STATUS_STYLES: Record<ProductStatus, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { label: 'Inactive', className: 'bg-slate-100 text-slate-600' },
};

/** Sortable columns and their header labels, in render order. */
const SORTABLE: ReadonlyArray<{ key: ProductSort; label: string }> = [
  { key: 'name', label: 'Name' },
  { key: 'price', label: 'Price' },
  { key: 'status', label: 'Status' },
  { key: 'createdAt', label: 'Added' },
];

/** A status pill mirroring the locations roster styling. */
function StatusPill({ status }: { status: ProductStatus }) {
  const { label, className } = STATUS_STYLES[status];
  return (
    <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${className}`}>{label}</span>
  );
}

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The products roster table (T4.6). Server-rendered data, client-side interaction:
 * sortable column headers and pagination, both of which read/write the URL search
 * params so the server page stays the single source of truth. Each row shows the
 * primary gallery image (or a placeholder), the formatted base price, the status,
 * and the variant count. The data never mutates here.
 */
export function ProductsTable({
  products,
  total,
  page,
  limit,
  sort,
  dir,
}: {
  products: AdminProductRow[];
  total: number;
  page: number;
  limit: number;
  sort: ProductSort;
  dir: SortDir;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  function hrefWith(overrides: Record<string, string>): string {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(overrides)) {
      if (value) {
        params.set(key, value);
      } else {
        params.delete(key);
      }
    }
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }

  function sortHref(key: ProductSort): string {
    const nextDir: SortDir = sort === key && dir === 'asc' ? 'desc' : 'asc';
    return hrefWith({ sort: key, dir: nextDir });
  }

  function sortIndicator(key: ProductSort): string {
    if (sort !== key) return '';
    return dir === 'asc' ? ' ▲' : ' ▼';
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (products.length === 0) {
    return (
      <p className="rounded-card border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
        No products match your filters yet.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
              {SORTABLE.map((column) => (
                <th key={column.key} className="py-2 pr-4 font-medium">
                  <Link
                    href={sortHref(column.key)}
                    scroll={false}
                    className="inline-flex items-center hover:text-slate-700"
                  >
                    {column.label}
                    <span aria-hidden>{sortIndicator(column.key)}</span>
                  </Link>
                </th>
              ))}
              <th className="py-2 pr-4 font-medium">Variants</th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr key={product.id} className="border-b border-slate-100 hover:bg-slate-50/60">
                <td className="py-2 pr-4">
                  <div className="flex items-center gap-3">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-card object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-brand-50 text-[10px] font-semibold text-brand-700">
                        No img
                      </span>
                    )}
                    <Link
                      href={`/products/${product.id}`}
                      className="font-medium text-slate-900 hover:text-brand-700"
                    >
                      {product.name}
                    </Link>
                  </div>
                </td>
                <td className="py-2 pr-4 tabular-nums text-slate-700">
                  {formatPrice(product.priceAmount, product.currency)}
                </td>
                <td className="py-2 pr-4">
                  <StatusPill status={product.status} />
                </td>
                <td className="py-2 pr-4 text-slate-700">{formatDate(product.createdAt)}</td>
                <td className="py-2 pr-4 text-slate-700">
                  {product.variantCount > 0 ? (
                    <span className="rounded-card bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {product.variantCount} {product.variantCount === 1 ? 'variant' : 'variants'}
                    </span>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-slate-500">
        <span className="tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
            className="rounded-card border border-slate-200 px-3 py-1 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
