'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminProductRow, ProductStatus } from '@fit/types';
import { Badge, Btn, Card, Icon, type Tone } from '@/components/ui';
import { formatPrice } from './format-price';
import { StockBadge, stockLevel } from './stock-badge';

/** Visual treatment per product status — success active, ink inactive. */
const STATUS_STYLES: Record<ProductStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

/**
 * The product catalog grid (T4.5) — the formacore shop artboard's card layout,
 * replacing the old roster table. Server-rendered data, client-side interaction:
 * only the pager reads/writes the URL search params (search, status and sort live in
 * their own controls) so the server page stays the single source of truth. Each card
 * shows the primary gallery image (or a placeholder), the status badge, the formatted
 * base price, the variant count, and a stock badge derived from the product's on-hand
 * levels. Low / out-of-stock cards carry an accent ring so a thinning line stands out.
 * Nothing mutates here.
 */
export function ProductsGrid({
  products,
  total,
  page,
  limit,
}: {
  products: AdminProductRow[];
  total: number;
  page: number;
  limit: number;
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
      <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => {
          const level = stockLevel(product);
          // Low / out-of-stock cards wear an accent ring so a thinning line surfaces
          // in the grid at a glance (the artboard's low-stock emphasis).
          const ring =
            level === 'out'
              ? 'ring-1 ring-danger-500/40 dark:ring-danger-400/40'
              : level === 'low'
                ? 'ring-1 ring-warning-500/40 dark:ring-warning-400/40'
                : '';
          const status = STATUS_STYLES[product.status];
          return (
            <li key={product.id}>
              <Card className={`flex h-full flex-col overflow-hidden ${ring}`}>
                <Link
                  href={`/products/${product.id}`}
                  className="group flex h-full flex-col focus:outline-none"
                >
                  <div className="relative aspect-square w-full overflow-hidden bg-ink-50 dark:bg-white/[0.03]">
                    {product.imageUrl ? (
                      <img
                        src={product.imageUrl}
                        alt=""
                        className="h-full w-full object-cover transition group-hover:scale-[1.03]"
                      />
                    ) : (
                      <span className="flex h-full w-full items-center justify-center text-ink-300 dark:text-ink-500">
                        <Icon name="bag" className="h-8 w-8" />
                      </span>
                    )}
                    <span className="absolute left-2 top-2">
                      <Badge tone={status.tone}>{status.label}</Badge>
                    </span>
                  </div>

                  <div className="flex flex-1 flex-col gap-2 p-3.5">
                    <h3 className="line-clamp-2 text-sm font-semibold text-ink-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
                      {product.name}
                    </h3>
                    <div className="mt-auto flex items-baseline justify-between gap-2">
                      <span className="font-mono text-base font-bold tabular-nums text-ink-900 dark:text-white">
                        {formatPrice(product.priceAmount, product.currency)}
                      </span>
                      <span className="text-[11px] text-ink-400">
                        {product.variantCount > 0
                          ? `${product.variantCount} ${product.variantCount === 1 ? 'variant' : 'variants'}`
                          : 'No variants'}
                      </span>
                    </div>
                    <div>
                      <StockBadge row={product} />
                    </div>
                  </div>
                </Link>
              </Card>
            </li>
          );
        })}
      </ul>

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
