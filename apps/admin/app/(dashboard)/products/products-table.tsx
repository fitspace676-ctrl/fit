'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type { AdminProductRow, ProductStatus } from '@fit/types';
import { Badge, Btn, Card, Icon, Switch, type Tone } from '@/components/ui';
import { formatPrice } from './format-price';
import { setProductActiveAction } from './actions';

/** Visual treatment per product status — success active, ink inactive. */
const STATUS_STYLES: Record<ProductStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

/**
 * Column headers, in render order (design: Product · Price · Added · Active · ›).
 * Sorting lives in the toolbar's dropdown, so the headers are plain labels.
 */
const HEADERS: ReadonlyArray<{ label: string; className?: string }> = [
  { label: 'Product' },
  { label: 'Price', className: 'hidden sm:table-cell' },
  { label: 'Added', className: 'hidden sm:table-cell' },
  { label: 'Active', className: 'text-center' },
  { label: '', className: 'text-right' },
];

/** A status pill for read-only staff, mirroring the detail page's styling. */
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

/** The product cell's subtext — "3 variants" / "No variants". */
function variantsLabel(product: AdminProductRow): string {
  return product.variantCount > 0
    ? `${product.variantCount} ${product.variantCount === 1 ? 'variant' : 'variants'}`
    : 'No variants';
}

/**
 * The shop catalog table (T4.6), reskinned to the Planflow "formacore" shop
 * reference. Server-rendered data, client-side interaction: row navigation into
 * the product page, the per-row active switch (a real `ProductWrite` mutation via
 * {@link setProductActiveAction} — read-only staff see a status pill instead),
 * and pagination reading/writing the URL search params so the server page stays
 * the single source of truth. Inactive products render dimmed, as in the design.
 */
export function ProductsTable({
  products,
  total,
  page,
  limit,
  canWrite,
}: {
  products: AdminProductRow[];
  total: number;
  page: number;
  limit: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();

  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [toggleError, setToggleError] = useState<string | null>(null);

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

  /** Flip a product's ACTIVE/INACTIVE state, then refresh the server-rendered page. */
  function toggleActive(product: AdminProductRow): void {
    setToggleError(null);
    setTogglingId(product.id);
    startTransition(async () => {
      const result = await setProductActiveAction(product.id, product.status !== 'ACTIVE');
      setTogglingId(null);
      if (result.ok) {
        router.refresh();
      } else {
        setToggleError(result.error);
      }
    });
  }

  const from = total === 0 ? 0 : (page - 1) * limit + 1;
  const to = Math.min(page * limit, total);
  const hasPrev = page > 1;
  const hasNext = page * limit < total;

  if (products.length === 0) {
    return (
      <Card className="px-4 py-12 text-center text-sm text-ink-500 dark:text-ink-400">
        No products match your filters.
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {toggleError ? (
        <Card role="alert" className="bg-danger-50 px-3 py-2 dark:bg-danger-500/10">
          <p className="text-sm text-danger-700 dark:text-danger-200">{toggleError}</p>
        </Card>
      ) : null}

      <Card className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <thead>
              <tr className="border-b border-ink-100 dark:border-white/10">
                {HEADERS.map((header, index) => (
                  <th
                    key={index}
                    className={`px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400 ${header.className ?? ''}`}
                  >
                    {header.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr
                  key={product.id}
                  onClick={() => router.push(`/products/${product.id}`)}
                  className={`cursor-pointer border-b border-ink-50 transition last:border-0 hover:bg-ink-50 dark:border-white/5 dark:hover:bg-white/[0.04] ${
                    product.status === 'INACTIVE' ? 'opacity-55' : ''
                  }`}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {product.imageUrl ? (
                        <img
                          src={product.imageUrl}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded-btn object-cover ring-1 ring-ink-200 dark:ring-white/10"
                        />
                      ) : (
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-btn bg-gradient-to-br from-brand-400/25 to-brand-600/10 text-brand-500 dark:text-brand-300">
                          <Icon name="bag" className="h-5 w-5" sw={2} />
                        </span>
                      )}
                      <div className="min-w-0">
                        <Link
                          href={`/products/${product.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="block truncate font-semibold text-ink-900 hover:text-brand-700 dark:text-white dark:hover:text-brand-300"
                        >
                          {product.name}
                        </Link>
                        <p className="text-xs text-ink-500 dark:text-ink-400 sm:hidden">
                          {formatPrice(product.priceAmount, product.currency)} ·{' '}
                          {variantsLabel(product)}
                        </p>
                        <p className="hidden text-xs text-ink-400 dark:text-ink-500 sm:block">
                          {variantsLabel(product)}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="hidden px-4 py-3 font-mono tabular-nums text-ink-900 dark:text-white sm:table-cell">
                    {formatPrice(product.priceAmount, product.currency)}
                  </td>
                  <td className="hidden px-4 py-3 font-mono text-xs tabular-nums text-ink-500 dark:text-ink-400 sm:table-cell">
                    {formatDate(product.createdAt)}
                  </td>
                  <td
                    className="px-4 py-3 text-center"
                    onClick={(event) => event.stopPropagation()}
                  >
                    {canWrite ? (
                      <span
                        className={`inline-flex ${togglingId === product.id ? 'pointer-events-none opacity-50' : ''}`}
                      >
                        <Switch
                          checked={product.status === 'ACTIVE'}
                          onChange={() => toggleActive(product)}
                          label={`${product.status === 'ACTIVE' ? 'Deactivate' : 'Activate'} ${product.name}`}
                        />
                      </span>
                    ) : (
                      <StatusPill status={product.status} />
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Icon
                      name="chevronRight"
                      className="inline h-4 w-4 text-ink-400 dark:text-ink-500"
                      sw={2}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
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
            icon="chevronLeft"
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
            iconRight="chevronRight"
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
