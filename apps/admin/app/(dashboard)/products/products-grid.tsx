'use client';

import { useTransition } from 'react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import type { AdminProductRow, ProductStatus } from '@fit/types';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Btn, Icon, type Tone } from '@/components/ui';
import { formatPrice } from './format-price';
import { StockBadge, stockLevel } from './stock-badge';

/** Visual treatment per product status — success active, ink inactive. */
const STATUS_STYLES: Record<ProductStatus, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
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
 * carry an accent ring so a thinning line stands out. Nothing mutates here.
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
      <Card variant="default" padding={0} xstyle={styles.emptyCard}>
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
              <Card variant="default" padding={0} xstyle={cardStyle}>
                <Link href={`/products/${product.id}`} {...stylex.props(styles.cardLink)}>
                  <div {...stylex.props(styles.media)}>
                    {product.imageUrl ? (
                      <img src={product.imageUrl} alt="" {...stylex.props(styles.image)} />
                    ) : (
                      <span {...stylex.props(styles.placeholder)}>
                        <Icon name="bag" {...stylex.props(styles.placeholderIcon)} />
                      </span>
                    )}
                    <span {...stylex.props(styles.statusBadge)}>
                      <Badge tone={status.tone}>{status.label}</Badge>
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
      <div {...stylex.props(styles.pagerRow)}>
        <span {...stylex.props(styles.pagerCount)}>
          {from}–{to} of {total}
        </span>
        <div {...stylex.props(styles.pagerBtns)}>
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
