import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProduct } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Badge, Icon, type Tone } from '@/components/ui';
import { formatPrice } from '../format-price';
import { ProductActions } from './product-actions';

export const metadata: Metadata = {
  title: 'Product — Fit Admin',
};

// The detail reflects live product state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; tone: Tone }> = {
  ACTIVE: { label: 'Active', tone: 'success' },
  INACTIVE: { label: 'Inactive', tone: 'ink' },
};

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  errorPage: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
  },
  backLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.25rem',
    alignSelf: 'flex-start',
    fontSize: '0.875rem',
    fontWeight: 500,
    textDecoration: 'none',
    color: 'var(--color-text-accent)',
  },
  backIcon: {
    width: '1rem',
    height: '1rem',
  },
  errorCard: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
    padding: '1rem',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
  errorIcon: {
    width: '1.25rem',
    height: '1.25rem',
    flexShrink: 0,
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headText: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  price: {
    margin: 0,
    fontSize: '1.125rem',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  gallery: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '0.75rem',
  },
  galleryImg: {
    height: '8rem',
    width: '8rem',
    borderRadius: 'var(--radius-container)',
    objectFit: 'cover',
    boxShadow: '0 0 0 1px var(--color-border)',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.5rem',
  },
  sectionHeading: {
    margin: 0,
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  description: {
    margin: 0,
    maxWidth: '42rem',
    whiteSpace: 'pre-line',
    fontSize: '0.875rem',
    color: 'var(--color-text-primary)',
  },
  tableCard: {
    maxWidth: '36rem',
    overflowX: 'auto',
  },
  table: {
    width: '100%',
    borderCollapse: 'collapse',
    textAlign: 'left',
    fontSize: '0.875rem',
  },
  headRow: {
    borderBottomWidth: '1px',
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  head: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontSize: '0.6875rem',
    fontWeight: 600,
    textTransform: 'uppercase',
    letterSpacing: '0.15em',
    color: 'var(--color-text-secondary)',
  },
  bodyRow: {
    borderBottomWidth: {
      default: '1px',
      ':last-child': 0,
    },
    borderBottomStyle: 'solid',
    borderBottomColor: 'var(--color-border)',
  },
  nameCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontWeight: 500,
    color: 'var(--color-text-primary)',
  },
  skuCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
  numCell: {
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontFamily: 'var(--font-family-code)',
    fontVariantNumeric: 'tabular-nums',
    color: 'var(--color-text-primary)',
  },
  emptyText: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  footnote: {
    margin: 0,
    fontSize: '0.75rem',
    color: 'var(--color-text-secondary)',
  },
});

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The product detail page (T4.6), rebuilt on Astryx + brand-tokened StyleX (T11.22).
 * Server-fetches `GET /admin/products/:id` and renders the identity header (name +
 * status), the image gallery, the base price and description, and the variants
 * table, plus the write controls for `ProductWrite` staff. A `404` from the API —
 * unknown or cross-tenant id — becomes Next's `notFound()`; any other failure
 * surfaces inline.
 */
export default async function ProductDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  let product;
  try {
    product = await fetchProduct(id);
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) {
      notFound();
    }
    const message =
      error instanceof ApiError
        ? `Could not load this product (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    return (
      <div {...stylex.props(styles.errorPage)}>
        <Link href="/products" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          Back to products
        </Link>
        <Card role="alert" variant="default" padding={0} xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{message}</span>
        </Card>
      </div>
    );
  }

  const status = STATUS_LABELS[product.status] ?? {
    label: product.status,
    tone: 'ink' as Tone,
  };

  // Write controls (edit + deactivate) are a `ProductWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  return (
    <div {...stylex.props(styles.page)}>
      <Link href="/products" {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        Back to products
      </Link>

      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headText)}>
          <div {...stylex.props(styles.titleRow)}>
            <h1 {...stylex.props(styles.title)}>{product.name}</h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p {...stylex.props(styles.price)}>
            {formatPrice(product.priceAmount, product.currency)}
          </p>
        </div>
        {canWrite ? <ProductActions productId={product.id} status={product.status} /> : null}
      </header>

      {product.images.length > 0 ? (
        <section {...stylex.props(styles.gallery)}>
          {product.images.map((url, index) => (
            <img
              key={url}
              src={url}
              alt={`${product.name} image ${index + 1}`}
              {...stylex.props(styles.galleryImg)}
            />
          ))}
        </section>
      ) : null}

      {product.description ? (
        <section {...stylex.props(styles.section)}>
          <h2 {...stylex.props(styles.sectionHeading)}>Description</h2>
          <p {...stylex.props(styles.description)}>{product.description}</p>
        </section>
      ) : null}

      <section {...stylex.props(styles.section)}>
        <h2 {...stylex.props(styles.sectionHeading)}>Variants</h2>
        {product.variants.length > 0 ? (
          <Card variant="default" padding={0} xstyle={styles.tableCard}>
            <table {...stylex.props(styles.table)}>
              <thead>
                <tr {...stylex.props(styles.headRow)}>
                  <th {...stylex.props(styles.head)}>Name</th>
                  <th {...stylex.props(styles.head)}>SKU</th>
                  <th {...stylex.props(styles.head)}>Price</th>
                  <th {...stylex.props(styles.head)}>Stock</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant, index) => (
                  <tr key={index} {...stylex.props(styles.bodyRow)}>
                    <td {...stylex.props(styles.nameCell)}>{variant.name}</td>
                    <td {...stylex.props(styles.skuCell)}>{variant.sku || '—'}</td>
                    <td {...stylex.props(styles.numCell)}>
                      {variant.priceAmount === null
                        ? formatPrice(product.priceAmount, product.currency)
                        : formatPrice(variant.priceAmount, product.currency)}
                    </td>
                    <td {...stylex.props(styles.numCell)}>{variant.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <p {...stylex.props(styles.emptyText)}>No variants.</p>
        )}
      </section>

      <p {...stylex.props(styles.footnote)}>Added {formatDate(product.createdAt)}.</p>
    </div>
  );
}
