'use client';

import { useEffect, useRef, useState, useTransition, type ReactNode, type RefObject } from 'react';
import Link from 'next/link';
import { formatPrice } from '@/app/(dashboard)/products/format-price';
import { searchPosProductsAction, type PosProductRow } from '@/app/(dashboard)/pos/actions';
import { buttonClasses, Icon } from '@/components/ui';
import { PosIcon } from './pos-icons';

/** Debounce (ms) before a keystroke fires a new product search. */
const SEARCH_DEBOUNCE_MS = 200;

/** A hotkey chip rendered inside the search field / toolbar buttons. */
function Kbd({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={`rounded bg-ink-100 font-mono text-[10px] text-ink-500 dark:bg-white/10 dark:text-ink-400 ${className}`}
    >
      {children}
    </kbd>
  );
}

/**
 * The POS product grid (left column). A debounced full-text search over the gym's
 * active catalogue (reusing the tenant-scoped roster endpoint) renders a grid of
 * tappable tiles; tapping a tile adds the product to the cart. The grid loads the
 * first page of products on mount so the operator sees stock before typing.
 *
 * The `searchRef` is owned by the board so the `F1` hotkey can focus the box
 * without this component knowing about the keymap; `onOpenLookup` opens the
 * member-lookup drawer (the toolbar's "Member" button, `F2`).
 */
export function ProductGrid({
  searchRef,
  onAdd,
  onOpenLookup,
  reconciliationHref,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  onAdd: (product: PosProductRow) => void;
  onOpenLookup: () => void;
  reconciliationHref: string | null;
}) {
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<PosProductRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Run the search whenever the (debounced) query changes, including the initial
  // empty query that populates the grid on mount.
  useEffect(() => {
    let cancelled = false;
    startTransition(async () => {
      const result = await searchPosProductsAction(query);
      if (cancelled) {
        return;
      }
      if (result.ok) {
        setProducts(result.data);
        setError(null);
      } else {
        setProducts([]);
        setError(result.error);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [query]);

  function onSearchChange(value: string): void {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => setQuery(value), SEARCH_DEBOUNCE_MS);
  }

  return (
    <>
      {/* Search + member toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <label htmlFor="pos-product-search" className="sr-only">
            Search products (F1)
          </label>
          <Icon
            name="search"
            className="absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-ink-400 dark:text-ink-500"
            sw={2}
          />
          <input
            ref={searchRef}
            id="pos-product-search"
            type="search"
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search products…"
            className="h-12 w-full rounded-field bg-ink-50 pl-11 pr-16 text-sm text-ink-900 outline-none ring-1 ring-inset ring-ink-200 transition placeholder:text-ink-400 focus:ring-2 focus:ring-brand-500 dark:bg-white/[0.04] dark:text-white dark:ring-white/10 dark:placeholder:text-ink-500"
          />
          <Kbd className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-1">F1</Kbd>
        </div>
        <button type="button" onClick={onOpenLookup} className={buttonClasses('outline', 'md')}>
          <PosIcon name="userPlus" className="h-4 w-4" sw={2.1} />
          Member
          <Kbd className="ml-0.5 px-1 py-0.5">F2</Kbd>
        </button>
        {reconciliationHref ? (
          <Link href={reconciliationHref} className={buttonClasses('outline', 'md')}>
            End of day
          </Link>
        ) : null}
      </div>

      {error ? (
        <div
          role="alert"
          className="flex items-center gap-2 rounded-card p-3 text-sm text-danger-700 ring-1 ring-inset ring-danger-500/30 dark:text-danger-300"
        >
          <Icon name="info" className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      ) : null}

      {/* Product grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
        {products.map((product) => (
          <button
            key={product.id}
            type="button"
            onClick={() => onAdd(product)}
            className="group relative overflow-hidden rounded-card bg-white text-left ring-1 ring-inset ring-ink-200 transition hover:ring-ink-300 hover:shadow-[0_10px_28px_-14px_rgba(0,0,0,0.3)] active:scale-[0.98] dark:bg-white/[0.03] dark:ring-white/10 dark:hover:bg-white/[0.06] dark:hover:ring-white/20"
          >
            <div className="relative grid h-24 place-items-center overflow-hidden bg-gradient-to-br from-brand-400/25 to-brand-600/10">
              <span
                aria-hidden
                className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent"
              />
              {product.imageUrl ? (
                <img
                  src={product.imageUrl}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <Icon
                  name="bag"
                  className="h-9 w-9 text-brand-500 transition-transform group-hover:scale-110 dark:text-brand-300"
                  sw={1.9}
                />
              )}
            </div>
            <div className="p-3">
              <p className="text-sm font-semibold leading-tight text-ink-900 dark:text-white">
                {product.name}
              </p>
              <div className="mt-1.5 flex items-center justify-between">
                <span className="font-mono text-sm font-bold tabular-nums text-ink-900 dark:text-white">
                  {formatPrice(product.priceAmount, product.currency)}
                </span>
              </div>
            </div>
          </button>
        ))}
        {products.length === 0 && !isPending && !error ? (
          <div className="col-span-full rounded-card border border-dashed border-ink-200 py-12 text-center dark:border-white/10">
            <p className="text-sm text-ink-500 dark:text-ink-400">
              {query.trim() !== ''
                ? `No products match “${query.trim()}”.`
                : 'No active products yet.'}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}
