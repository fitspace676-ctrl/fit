'use client';

import { useEffect, useMemo, useRef, useState, useTransition, type RefObject } from 'react';
import { useTranslations } from 'next-intl';
import * as stylex from '@stylexjs/stylex';
import { formatPrice } from '@/app/(dashboard)/shop/format-price';
import {
  fetchPosMembershipsAction,
  searchPosProductsAction,
  type PosMembershipRow,
  type PosProductRow,
} from '@/app/(dashboard)/pos/actions';
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
  tabs: { display: 'flex', gap: '0.5rem' },
  tab: {
    height: '2.25rem',
    paddingInline: '0.875rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: 'transparent',
    fontFamily: 'inherit',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: 'var(--color-text-secondary)',
    cursor: 'pointer',
  },
  tabActive: {
    borderColor: 'var(--color-accent)',
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 14%, transparent)',
    color: 'var(--color-text-primary)',
  },
  // A membership tile has no image, so it leads with the name and carries a
  // duration badge instead of the product tile's media block.
  membershipTop: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '0.5rem',
    width: '100%',
  },
  durationBadge: {
    flexShrink: 0,
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    borderRadius: 'var(--radius-pill, 999px)',
    backgroundColor: 'color-mix(in srgb, var(--color-accent) 16%, transparent)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
});

/** The catalogue sections the POS can sell from. */
type Catalogue = 'memberships' | 'products';

/**
 * The POS catalogue (left column), split into what a gym sells across the counter:
 * **Memberships** (its active subscription plans) and **Products** (the shop's
 * stock). Tapping a tile adds that line to the cart.
 *
 * Products are searched server-side, debounced, and reload as the operator types.
 * Memberships are a handful of rows, so they load once and filter in memory — a
 * round-trip per keystroke would be wasted on a list that fits on screen.
 *
 * Selling a membership enrols the attached member on that plan, which is why the
 * cart refuses to complete one without a member; the tile itself stays tappable so
 * the operator can build the sale and attach the member in either order.
 *
 * The `searchRef` is owned by the board so the `F1` hotkey can focus the box
 * without this component knowing about the keymap.
 */
export function ProductGrid({
  searchRef,
  onAdd,
  onAddMembership,
}: {
  searchRef: RefObject<HTMLInputElement | null>;
  onAdd: (product: PosProductRow) => void;
  onAddMembership: (membership: PosMembershipRow) => void;
}) {
  const t = useTranslations('admin.pos.products');
  const [catalogue, setCatalogue] = useState<Catalogue>('memberships');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<PosProductRow[]>([]);
  const [memberships, setMemberships] = useState<PosMembershipRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The gym's plans change rarely and are few, so they are fetched once.
  useEffect(() => {
    let cancelled = false;
    void fetchPosMembershipsAction().then((result) => {
      if (cancelled) return;
      if (result.ok) setMemberships(result.data);
      else setError(result.error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const shownMemberships = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return memberships;
    return memberships.filter((plan) => plan.name.toLowerCase().includes(needle));
  }, [memberships, query]);

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

      <div {...stylex.props(styles.tabs)} role="tablist" aria-label="Catalogue">
        {(['memberships', 'products'] as const).map((section) => (
          <button
            key={section}
            type="button"
            role="tab"
            aria-selected={catalogue === section}
            onClick={() => setCatalogue(section)}
            {...stylex.props(styles.tab, catalogue === section && styles.tabActive)}
          >
            {section === 'memberships' ? 'Memberships' : 'Products'}
          </button>
        ))}
      </div>

      {error ? (
        <Card variant="default" padding={0} role="alert" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span {...stylex.props(styles.errorText)}>{error}</span>
        </Card>
      ) : null}

      {catalogue === 'memberships' ? (
        <div {...stylex.props(styles.scrollArea)}>
          {shownMemberships.length === 0 ? (
            <p {...stylex.props(styles.empty)}>
              {memberships.length === 0
                ? 'No active membership plans to sell yet.'
                : 'No memberships match that.'}
            </p>
          ) : (
            <ul {...stylex.props(styles.grid)}>
              {shownMemberships.map((plan) => (
                <li key={plan.id}>
                  <button
                    type="button"
                    onClick={() => onAddMembership(plan)}
                    {...stylex.props(styles.tile)}
                  >
                    <span {...stylex.props(styles.membershipTop)}>
                      <span {...stylex.props(styles.tileName)}>{plan.name}</span>
                      <span {...stylex.props(styles.durationBadge)}>{plan.durationLabel}</span>
                    </span>
                    <span {...stylex.props(styles.tilePrice)}>
                      {formatPrice(plan.priceAmount, plan.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        <div {...stylex.props(styles.scrollArea)}>
          {products.length === 0 && !isPending && !error ? (
            <p {...stylex.props(styles.empty)}>{t('empty')}</p>
          ) : (
            <ul {...stylex.props(styles.grid)}>
              {products.map((product) => (
                <li key={product.id}>
                  <button
                    type="button"
                    onClick={() => onAdd(product)}
                    {...stylex.props(styles.tile)}
                  >
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
      )}
    </div>
  );
}
