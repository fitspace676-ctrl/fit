'use client';

import { useEffect, useRef, useState, useTransition, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { formatPrice } from '@/app/(dashboard)/products/format-price';
import { searchPosProductsAction, type PosProductRow } from '@/app/(dashboard)/pos/actions';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';

/** Debounce (ms) before a keystroke fires a new product search. */
const SEARCH_DEBOUNCE_MS = 200;

const styles = stylex.create({
  root: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    gap: '1rem',
  },
  searchWrap: {
    position: 'relative',
  },
  srOnly: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    whiteSpace: 'nowrap',
    borderWidth: 0,
  },
  searchInput: {
    height: '3rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '1rem',
    paddingBlock: 0,
    fontSize: '1rem',
    color: 'var(--color-text-primary)',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
    '::placeholder': {
      color: 'var(--color-text-secondary)',
    },
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: '0.75rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
  },
  errorIcon: {
    width: '1rem',
    height: '1rem',
    flexShrink: 0,
    color: 'var(--color-error)',
  },
  errorText: {
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  scrollArea: {
    minHeight: 0,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: '0%',
    overflowY: 'auto',
  },
  empty: {
    margin: 0,
    paddingInline: '0.25rem',
    paddingBlock: '2rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    display: 'grid',
    listStyle: 'none',
    margin: 0,
    padding: 0,
    gap: '0.75rem',
    gridTemplateColumns: {
      default: 'repeat(2, minmax(0, 1fr))',
      '@media (min-width: 640px)': 'repeat(3, minmax(0, 1fr))',
      '@media (min-width: 1024px)': 'repeat(4, minmax(0, 1fr))',
    },
  },
  tile: {
    display: 'flex',
    height: '100%',
    width: '100%',
    flexDirection: 'column',
    gap: '0.5rem',
    borderRadius: 'var(--radius-container)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-accent)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    padding: '0.75rem',
    textAlign: 'left',
    cursor: 'pointer',
    transitionProperty: 'color, background-color, border-color, box-shadow',
    transitionDuration: '150ms',
    outline: 'none',
    boxShadow: {
      default: 'none',
      ':focus': '0 0 0 4px color-mix(in srgb, var(--color-accent) 20%, transparent)',
    },
  },
  tileMedia: {
    aspectRatio: '1 / 1',
    width: '100%',
    overflow: 'hidden',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
  },
  tileImg: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
  },
  tileInitial: {
    display: 'flex',
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '1.5rem',
    color: 'var(--color-text-disabled)',
  },
  tileName: {
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  tilePrice: {
    marginTop: 'auto',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
});

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
  const t = useTranslations('admin.pos.products');
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
    <div {...stylex.props(styles.root)}>
      <div {...stylex.props(styles.searchWrap)}>
        <label htmlFor="pos-product-search" {...stylex.props(styles.srOnly)}>
          {t('searchLabel')}
        </label>
        <input
          ref={searchRef}
          id="pos-product-search"
          type="search"
          onChange={(event) => onSearchChange(event.target.value)}
          placeholder={t('searchPlaceholder')}
          {...stylex.props(styles.searchInput)}
        />
      </div>

      {error ? (
        <Card variant="default" padding={0} role="alert" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span {...stylex.props(styles.errorText)}>{error}</span>
        </Card>
      ) : null}

      <div {...stylex.props(styles.scrollArea)}>
        {products.length === 0 && !isPending && !error ? (
          <p {...stylex.props(styles.empty)}>{t('empty')}</p>
        ) : (
          <ul {...stylex.props(styles.grid)}>
            {products.map((product) => (
              <li key={product.id}>
                <button type="button" onClick={() => onAdd(product)} {...stylex.props(styles.tile)}>
                  <div {...stylex.props(styles.tileMedia)}>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" {...stylex.props(styles.tileImg)} />
                    ) : (
                      <div {...stylex.props(styles.tileInitial)}>
                        {product.name.slice(0, 1).toUpperCase()}
                      </div>
                    )}
                  </div>
                  <span {...stylex.props(styles.tileName)}>{product.name}</span>
                  <span {...stylex.props(styles.tilePrice)}>
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
