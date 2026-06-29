'use client';

import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import type { ProductSummary } from '@fit/types';
import { fetchProducts } from '@/lib/shop';
import { Btn, Card } from '@/src/components/ui';
import { EmptyShop } from './EmptyShop';
import { ProductsGrid } from './ProductsGrid';

export interface ShopBrowserProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
}

/** Fetch lifecycle for the gym's catalogue. */
interface LoadState {
  products: ProductSummary[];
  status: 'loading' | 'ready' | 'error';
}

/**
 * Client orchestrator for the shop listing: fetches the gym's active products
 * once and renders the card grid, degrading on its own — a spinner-less loading
 * line while it loads, a retryable error, and an empty state. No gym in scope
 * (apex / preview) settles straight to empty. Mirrors the trainers index's
 * {@link import('../trainers/TrainersBrowser').TrainersBrowser}, minus the
 * filters: the listing is pure discovery.
 */
export function ShopBrowser({ gymId }: ShopBrowserProps) {
  const t = useTranslations('shop');

  const [load, setLoad] = useState<LoadState>({ products: [], status: 'loading' });
  // Bumped by "Try again" to re-run the fetch effect after a failure.
  const [reloadKey, setReloadKey] = useState(0);

  // Fetch the gym's products; cancel an in-flight request on unmount, a gym
  // change, or a retry. No gym in scope → nothing to load, settle as empty.
  useEffect(() => {
    if (!gymId) {
      setLoad({ products: [], status: 'ready' });
      return;
    }

    const controller = new AbortController();
    setLoad((prev) => ({ products: prev.products, status: 'loading' }));

    fetchProducts({ gymId, signal: controller.signal })
      .then((products) => setLoad({ products, status: 'ready' }))
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        setLoad({ products: [], status: 'error' });
      });

    return () => controller.abort();
  }, [gymId, reloadKey]);

  if (load.status === 'loading') {
    return (
      <p className="py-16 text-center text-sm text-ink-500 dark:text-ink-400">
        {t('browse.loading')}
      </p>
    );
  }

  if (load.status === 'error') {
    return (
      <Card glow className="flex flex-col items-center gap-4 px-6 py-16 text-center">
        <p className="text-sm text-ink-600 dark:text-ink-300">{t('browse.error')}</p>
        <Btn v="outline" onClick={() => setReloadKey((key) => key + 1)}>
          {t('retry')}
        </Btn>
      </Card>
    );
  }

  if (load.products.length === 0) {
    return <EmptyShop />;
  }

  return <ProductsGrid products={load.products} />;
}
