'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { AdminProductCategory, AdminProductRow, ProductStatus } from '@fit/types';
import { Badge, Button, Card, type BadgeTone } from '@fit/ui-kit';
import { Icon } from '@/components/ui';
import { setProductCategoryAction } from './actions';
import { formatPrice, marginPercent } from './format-price';
import { StockBadge, stockLevel } from './stock-badge';

/** Visual treatment per product status — success active, ink inactive. */
const STATUS_STYLES: Record<ProductStatus, { label: string; tone: BadgeTone }> = {
  ACTIVE: { label: 'Active', tone: 'positive' },
  INACTIVE: { label: 'Inactive', tone: 'neutral' },
};

const styles = stylex.create({
  stack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  emptyCard: {
    paddingInline: '1rem',
    paddingBlock: '2.5rem',
    textAlign: 'center',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: {
      default: '1fr 1fr',
      '@media (min-width: 640px)': 'repeat(3, 1fr)',
      '@media (min-width: 1024px)': 'repeat(4, 1fr)',
    },
    gap: '1rem',
    margin: 0,
    padding: 0,
    listStyle: 'none',
  },
  card: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  cardLow: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
    // Low-stock cards wear a warning ring so a thinning line surfaces in the grid.
    boxShadow: '0 0 0 1px var(--color-warning)',
  },
  cardOut: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    overflow: 'hidden',
    // Out-of-stock cards wear an error ring — the most urgent emphasis.
    boxShadow: '0 0 0 1px var(--color-error)',
  },
  cardLink: {
    display: 'flex',
    height: '100%',
    flexDirection: 'column',
    textDecoration: 'none',
    color: 'inherit',
    outline: {
      default: null,
      ':focus': 'none',
    },
  },
  media: {
    position: 'relative',
    aspectRatio: '1 / 1',
    width: '100%',
    overflow: 'hidden',
    backgroundColor: 'var(--color-background-muted)',
  },
  image: {
    height: '100%',
    width: '100%',
    objectFit: 'cover',
    transitionProperty: 'transform',
    transitionDuration: '150ms',
    transform: {
      default: 'none',
      ':hover': 'scale(1.03)',
    },
  },
  placeholder: {
    display: 'flex',
    height: '100%',
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--color-text-disabled)',
  },
  placeholderIcon: {
    width: '2rem',
    height: '2rem',
  },
  statusBadge: {
    position: 'absolute',
    left: '0.5rem',
    top: '0.5rem',
  },
  body: {
    display: 'flex',
    flexGrow: 1,
    flexDirection: 'column',
    gap: '0.5rem',
    padding: '0.875rem',
  },
  name: {
    margin: 0,
    display: '-webkit-box',
    WebkitBoxOrient: 'vertical',
    WebkitLineClamp: 2,
    overflow: 'hidden',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: {
      default: 'var(--color-text-primary)',
      ':hover': 'var(--color-text-accent)',
    },
  },
  priceRow: {
    marginTop: 'auto',
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '0.5rem',
  },
  price: {
    fontFamily: 'var(--font-family-code)',
    fontSize: '1rem',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  variantCount: {
    fontSize: '0.6875rem',
    color: 'var(--color-text-secondary)',
  },
  categoryChip: {
    alignSelf: 'flex-start',
    maxWidth: '100%',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    borderRadius: 'var(--radius-full)',
    backgroundColor: 'var(--color-accent-muted)',
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    fontSize: '0.6875rem',
    fontWeight: 600,
    color: 'var(--color-text-accent)',
  },
  // The picker sits under the card's link, not inside it — a control nested in an
  // anchor is neither valid markup nor operable by keyboard.
  pickerRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    borderTopWidth: '1px',
    borderTopStyle: 'solid',
    borderTopColor: 'var(--color-border)',
    paddingInline: '0.75rem',
    paddingBlock: '0.5rem',
  },
  pickerSelect: {
    height: '2rem',
    width: '100%',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: {
      default: 'var(--color-border)',
      ':hover': 'var(--color-border-emphasized)',
      ':focus': 'var(--color-accent)',
    },
    backgroundColor: 'var(--color-background-surface)',
    paddingInline: '0.5rem',
    fontFamily: 'inherit',
    fontSize: '0.75rem',
    color: 'var(--color-text-primary)',
    cursor: 'pointer',
    outline: 'none',
    opacity: {
      default: 1,
      ':disabled': 0.6,
    },
  },
  pickerError: {
    margin: 0,
    fontSize: '0.6875rem',
    color: 'var(--color-error)',
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
  pagerRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  pagerCount: {
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
  },
  pagerBtns: {
    display: 'flex',
    gap: '0.5rem',
  },
});

/**
 * The product catalog grid (T4.5), rebuilt on Astryx Cards + brand-tokened StyleX
 * (T11.22) — the shop's card layout, replacing the old roster table. Server-rendered
 * data, client-side interaction: only the pager reads/writes the URL search params
 * (search, status and sort live in their own controls) so the server page stays the
 * single source of truth. Each card shows the primary gallery image (or a
 * placeholder), the status badge, the formatted base price, the variant count, and a
 * stock badge derived from the product's on-hand levels. Low / out-of-stock cards
 * carry an accent ring so a thinning line stands out.
 *
 * The one write is the shelf: each card carries a {@link CategoryPicker} for staff
 * who may edit the catalogue, so filing products is done where they are all in
 * front of you rather than one editor visit at a time.
 */
export function ProductsGrid({
  products,
  total,
  page,
  limit,
  categories,
  canWrite,
}: {
  products: AdminProductRow[];
  total: number;
  page: number;
  limit: number;
  /** The gym's shelves, for the per-card picker. Empty renders the card's plain chip. */
  categories: AdminProductCategory[];
  /** Whether the viewer may file products — the picker is a `ProductWrite` action. */
  canWrite: boolean;
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
      <Card padding="none" xstyle={styles.emptyCard}>
        No products match your filters yet.
      </Card>
    );
  }

  return (
    <div {...stylex.props(styles.stack)}>
      <ul {...stylex.props(styles.grid)}>
        {products.map((product) => {
          const level = stockLevel(product);
          // Low / out-of-stock cards wear an accent ring so a thinning line surfaces
          // in the grid at a glance.
          const cardStyle =
            level === 'out' ? styles.cardOut : level === 'low' ? styles.cardLow : styles.card;
          const status = STATUS_STYLES[product.status];
          return (
            <li key={product.id}>
              <Card padding="none" xstyle={cardStyle}>
                <Link href={`/shop/${product.id}`} {...stylex.props(styles.cardLink)}>
                  <div {...stylex.props(styles.media)}>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" {...stylex.props(styles.image)} />
                    ) : (
                      <span {...stylex.props(styles.placeholder)}>
                        <Icon name="bag" {...stylex.props(styles.placeholderIcon)} />
                      </span>
                    )}
                    <span {...stylex.props(styles.statusBadge)}>
                      <Badge tone={status.tone} label={status.label} />
                    </span>
                  </div>

                  <div {...stylex.props(styles.body)}>
                    <h3 {...stylex.props(styles.name)}>{product.name}</h3>
                    <div {...stylex.props(styles.priceRow)}>
                      <span {...stylex.props(styles.price)}>
                        {formatPrice(product.priceAmount, product.currency)}
                      </span>
                      <span {...stylex.props(styles.variantCount)}>
                        {product.variantCount > 0
                          ? `${product.variantCount} ${product.variantCount === 1 ? 'variant' : 'variants'}`
                          : 'No variants'}
                      </span>
                    </div>
                    {marginPercent(product.priceAmount, product.costAmount) !== null ? (
                      <span {...stylex.props(styles.variantCount)}>
                        {marginPercent(product.priceAmount, product.costAmount)}% margin
                      </span>
                    ) : null}
                    {/* Read-only viewers keep the plain chip; everyone else gets the
                        picker below, outside the link that owns the rest of the card. */}
                    {product.category && !(canWrite && categories.length > 0) ? (
                      <span {...stylex.props(styles.categoryChip)}>{product.category.name}</span>
                    ) : null}
                    <div>
                      <StockBadge row={product} />
                    </div>
                  </div>
                </Link>

                {canWrite && categories.length > 0 ? (
                  <CategoryPicker product={product} categories={categories} />
                ) : null}
              </Card>
            </li>
          );
        })}
      </ul>

      {/* Pager. */}
      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>
          {from}–{to} of {total}
        </span>
        <div {...stylex.props(styles.pagerBtns)}>
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page - 1) })))
            }
            disabled={!hasPrev}
            label="Previous"
          />
          <Button
            variant="secondary"
            size="inline"
            onClick={() =>
              startTransition(() => router.replace(hrefWith({ page: String(page + 1) })))
            }
            disabled={!hasNext}
            label="Next"
          />
        </div>
      </div>
    </div>
  );
}

/**
 * The shelf a product sits on, changed in place from the roster card.
 *
 * A picker here rather than a trip through the editor, because filing a catalogue
 * is dozens of these in a row: open → edit → save → navigate back, per product, is
 * the reason most catalogues stay unfiled. It writes through the API's
 * single-column endpoint, so a move can never carry a stale copy of everything
 * else about the product along with it.
 *
 * The value moves as soon as it is tapped and rolls back only if the write fails —
 * a select that snaps back for a moment on every change reads as broken.
 */
function CategoryPicker({
  product,
  categories,
}: {
  product: AdminProductRow;
  categories: AdminProductCategory[];
}) {
  const router = useRouter();
  const [value, setValue] = useState(product.category?.id ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign(next: string): Promise<void> {
    const previous = value;
    setValue(next);
    setSaving(true);
    setError(null);
    const result = await setProductCategoryAction(product.id, { categoryId: next || null });
    setSaving(false);
    if (!result.ok) {
      setValue(previous);
      setError(result.error);
      return;
    }
    // The roster's filter and its counts are server-rendered from the same rows,
    // so they follow the move rather than describing the catalogue as it was.
    router.refresh();
  }

  return (
    <div {...stylex.props(styles.pickerRow)}>
      <label htmlFor={`product-category-${product.id}`} {...stylex.props(styles.srOnly)}>
        Category for {product.name}
      </label>
      <select
        id={`product-category-${product.id}`}
        value={value}
        disabled={saving}
        onChange={(event) => void assign(event.target.value)}
        {...stylex.props(styles.pickerSelect)}
      >
        <option value="">No category</option>
        {categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      {error ? (
        <p role="alert" {...stylex.props(styles.pickerError)}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
