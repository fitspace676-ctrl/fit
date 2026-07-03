import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProduct } from '@/lib/api';
import { Badge, Card, Icon, type Tone } from '@/components/ui';
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

/** Render an ISO instant as a short local date, or an em dash when absent. */
function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * The product detail page (T4.6). Server-fetches `GET /admin/products/:id` and
 * renders the identity header (name + status), the image gallery, the base price
 * and description, and the variants table, plus the write controls for
 * `ProductWrite` staff. A `404` from the API — unknown or cross-tenant id —
 * becomes Next's `notFound()`; any other failure surfaces inline.
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
      <div className="flex flex-col gap-4">
        <Link
          href="/products"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
        >
          <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
          Back to shop
        </Link>
        <Card
          role="alert"
          className="flex items-center gap-3 p-4 text-sm text-danger-700 dark:text-danger-300"
        >
          <Icon name="info" className="h-5 w-5 shrink-0" />
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
    <div className="flex flex-col gap-6">
      <Link
        href="/products"
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to shop
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
              {product.name}
            </h1>
            <Badge tone={status.tone}>{status.label}</Badge>
          </div>
          <p className="text-lg font-semibold tabular-nums text-ink-800 dark:text-ink-100">
            {formatPrice(product.priceAmount, product.currency)}
          </p>
        </div>
        {canWrite ? <ProductActions productId={product.id} status={product.status} /> : null}
      </header>

      {product.images.length > 0 ? (
        <section className="flex flex-wrap gap-3">
          {product.images.map((url, index) => (
            <img
              key={url}
              src={url}
              alt={`${product.name} image ${index + 1}`}
              className="h-32 w-32 rounded-card object-cover ring-1 ring-ink-200 dark:ring-white/10"
            />
          ))}
        </section>
      ) : null}

      {product.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
            Description
          </h2>
          <p className="max-w-2xl whitespace-pre-line text-sm text-ink-700 dark:text-ink-200">
            {product.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
          Variants
        </h2>
        {product.variants.length > 0 ? (
          <Card className="max-w-xl overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-ink-100 dark:border-white/10">
                  <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    Name
                  </th>
                  <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    SKU
                  </th>
                  <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    Price
                  </th>
                  <th className="px-4 py-3 font-mono text-[11px] font-semibold uppercase tracking-[0.15em] text-ink-400">
                    Stock
                  </th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant, index) => (
                  <tr
                    key={index}
                    className="border-b border-ink-50 last:border-b-0 dark:border-white/5"
                  >
                    <td className="px-4 py-3 font-medium text-ink-800 dark:text-ink-100">
                      {variant.name}
                    </td>
                    <td className="px-4 py-3 text-ink-500 dark:text-ink-400">
                      {variant.sku || '—'}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                      {variant.priceAmount === null
                        ? formatPrice(product.priceAmount, product.currency)
                        : formatPrice(variant.priceAmount, product.currency)}
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums text-ink-700 dark:text-ink-200">
                      {variant.stock}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        ) : (
          <p className="text-sm text-ink-400">No variants.</p>
        )}
      </section>

      <p className="text-xs text-ink-400">Added {formatDate(product.createdAt)}.</p>
    </div>
  );
}
