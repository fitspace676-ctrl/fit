'use client';

import { useEffect, useState } from 'react';
import { Button, EmptyState } from '@/src/components/ui/kit';
import * as stylex from '@stylexjs/stylex';
import { useTranslations } from 'next-intl';
import type { CartView, ProductSummary } from '@fit/types';
import { fetchProducts } from '@/lib/shop';
import { Icon } from '@/src/components/ui';
import { EmptyShop } from './EmptyShop';
import { ProductList } from './ProductList';

// Astryx migration (T11), now on the portal kit: the shop browser's loading / error / empty states
// are rebuilt on the kit's `EmptyState` + `Button` over the FormaCore theme
// tokens, with layout in compiled StyleX — no Tailwind utilities. The catalogue
// fetch lifecycle below is unchanged.
//
// FormaCore redesign: it renders the row list rather than the card grid, and it
// passes the cart through so a row can show a stepper for what is already in it.
// The cart itself is owned a level up (`ShopScreen`), where the panel can share
// the same state — this component still only fetches and gates the catalogue.

const styles = stylex.create({
  loading: {
    paddingBlock: '4rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  errorIcon: {
    height: '2.25rem',
    width: '2.25rem',
    color: 'var(--color-text-secondary)',
  },
});

export interface ShopBrowserProps {
  /** Active gym id, or `null` when no tenant is in scope (apex / preview). */
  gymId: string | null;
  /** The live cart, so each row knows whether it is already in it. */
  cart: CartView;
  /** Hand the fresh cart up after a row's add / step. */
  onCart: (cart: CartView) => void;
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
export function ShopBrowser({ gymId, cart, onCart }: ShopBrowserProps) {
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
    return <p {...stylex.props(styles.loading)}>{t('browse.loading')}</p>;
  }

  if (load.status === 'error') {
    return (
      <EmptyState
        icon={<Icon name="bag" {...stylex.props(styles.errorIcon)} sw={1.8} />}
        title={t('browse.error')}
        action={
          <Button
            variant="secondary"
            size="card"
            label={t('retry')}
            onClick={() => setReloadKey((key) => key + 1)}
          />
        }
      />
    );
  }

  if (load.products.length === 0) {
    return <EmptyShop />;
  }

  return <ProductList products={load.products} cart={cart} onCart={onCart} />;
}
