'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminProductRow, ProductSort, ProductStatus, SortDir } from '@fit/types';
import { Badge, Btn, Card, type Tone } from '@/components/ui';
import { formatPrice } from './format-price';

/** Visual treatment per product status — success active, ink inactive. */
const STATUS_STYLES: Record<ProductStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
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
  const { label, tone } = STATUS_STYLES[status];
  return <Badge tone={tone}>{label}</Badge>;
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
      <Card className="px-4 py-10 text-center text-sm text-ink-500 dark:text-ink-400">
        No products match your filters yet.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-ink-100 dark:border-white/10">
              {SORTABLE.map((column) => (
                <th
                  key={column.key}
                  className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400"
                >
                  <Link
                    href={sortHref(column.key)}
                    scroll={false}
                    className="inline-flex items-center hover:text-ink-700 dark:hover:text-ink-200"
                  >
                    {column.label}
                    <span aria-hidden>{sortIndicator(column.key)}</span>
                  </Link>
                </th>
              ))}
              <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                Variants
              </th>
            </tr>
          </thead>
          <tbody>
            {products.map((product) => (
              <tr
                key={product.id}
                className="border-b border-ink-50 last:border-b-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04]"
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-10 w-10 shrink-0 rounded-btn object-cover"
                      />
                    ) : (
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-btn bg-brand-50 text-[10px] font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
                        No img
                      </span>
                    )}
                    <Link
                      href={`/products/${product.id}`}
                      className="font-medium text-ink-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300"
                    >
                      {product.name}
                    </Link>
                  </div>
                </td>
                <td className="px-4 py-3 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                  {formatPrice(product.priceAmount, product.currency)}
                </td>
                <td className="px-4 py-3">
                  <StatusPill status={product.status} />
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {formatDate(product.createdAt)}
                </td>
                <td className="px-4 py-3 text-ink-700 dark:text-ink-200">
                  {product.variantCount > 0 ? (
                    <Badge tone="ink">
                      {product.variantCount} {product.variantCount === 1 ? 'variant' : 'variants'}
                    </Badge>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* Pager. */}
      <div className="flex items-center justify-between text-sm text-ink-500 dark:text-ink-400">
        <span className="font-mono tabular-nums">
          {from}–{to} of {total}
        </span>
        <div className="flex gap-2">
          <Btn
            v="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
          >
            Previous
          </Btn>
          <Btn
            v="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
          >
            Next
          </Btn>
        </div>
      </div>
    </div>
  );
}
