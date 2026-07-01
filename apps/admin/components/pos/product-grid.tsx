'use client';

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import { formatPrice } from '@/app/products/format-price';
import { searchPosProductsAction, type PosProductRow } from '@/app/pos/actions';
import { Card, Icon } from '@/components/ui';

/** Debounce (ms) before a keystroke fires a new product search. */
const SEARCH_DEBOUNCE_MS = 200;

/**
 * The POS product grid (left column). A debounced full-text search over the gym's
 * active catalogue (reusing the tenant-scoped roster endpoint) renders a grid of
 * tappable tiles; tapping a tile adds the product to the cart. The grid loads the
 * first page of products on mount so the operator sees stock before typing.
 *
 * The `searchRef` is owned by the board so the `F1` hotkey can focus the box
 * without this component knowing about the keymap.
 */
export function ProductGrid({
  searchRef,
  onAdd,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  onAdd: (product: PosProductRow) => void;
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
    <div className="flex h-full flex-col gap-4">
      <div className="relative">
        <label htmlFor="pos-product-search" className="sr-only">
          Search products (F1)
        </label>
        <input
          ref={searchRef}
          id="pos-product-search"
          type="search"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder="Search products by name…  (F1)"
          className="h-12 w-full rounded-field border border-ink-200 bg-white px-4 text-base text-ink-900 placeholder:text-ink-400 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:text-white"
        />
      </div>

      {error ? (
        <Card
          role="alert"
          className="flex items-center gap-2 p-3 text-sm text-danger-700 dark:text-danger-300"
        >
          <Icon name="info" className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </Card>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto">
        {products.length === 0 && !isPending && !error ? (
          <p className="px-1 py-8 text-center text-sm text-ink-500 dark:text-ink-400">
            No active products match this search.
          </p>
        ) : (
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {products.map((product) => (
              <li key={product.id}>
                <button
                  type="button"
                  onClick={() => onAdd(product)}
                  className="flex h-full w-full flex-col gap-2 rounded-card border border-ink-200 bg-white p-3 text-left transition hover:border-brand-400 hover:shadow-sm focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/20 dark:border-white/10 dark:bg-white/[0.04] dark:hover:border-brand-500/60"
                >
                  <div className="aspect-square w-full overflow-hidden rounded-btn bg-ink-100 dark:bg-white/5">
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" className="h-full w-full object-cover" />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center text-2xl text-ink-300 dark:text-ink-600">
                        {product.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span className="line-clamp-2 text-sm font-medium text-ink-900 dark:text-white">
                    {product.name}
                  </span>
                  <span className="mt-auto font-mono text-sm font-semibold text-brand-700 dark:text-brand-300">
                    {formatPrice(product.priceAmount, product.currency)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
