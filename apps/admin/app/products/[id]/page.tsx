import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProduct } from '@/lib/api';
import { formatPrice } from '../format-price';
import { ProductActions } from './product-actions';

export const metadata: Metadata = {
  title: 'Product — Fit Admin',
};

// The detail reflects live product state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Visual treatment per status, matching the roster table's pills. */
const STATUS_LABELS: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'Active', className: 'bg-emerald-50 text-emerald-700' },
  INACTIVE: { label: 'Inactive', className: 'bg-slate-100 text-slate-600' },
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
        <Link href="/products" className="text-sm font-medium text-brand-700 hover:text-brand-800">
          ← Back to products
        </Link>
        <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
          {message}
        </p>
      </div>
    );
  }

  const status = STATUS_LABELS[product.status] ?? {
    label: product.status,
    className: 'bg-slate-100 text-slate-600',
  };

  // Write controls (edit + deactivate) are a `ProductWrite` capability.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  return (
    <div className="flex flex-col gap-6">
      <Link href="/products" className="text-sm font-medium text-brand-700 hover:text-brand-800">
        ← Back to products
      </Link>

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">{product.name}</h1>
            <span className={`rounded-card px-2 py-0.5 text-xs font-medium ${status.className}`}>
              {status.label}
            </span>
          </div>
          <p className="text-lg font-semibold tabular-nums text-slate-800">
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
              className="h-32 w-32 rounded-card object-cover"
            />
          ))}
        </section>
      ) : null}

      {product.description ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-xs uppercase tracking-wide text-slate-500">Description</h2>
          <p className="max-w-2xl whitespace-pre-line text-sm text-slate-700">
            {product.description}
          </p>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h2 className="text-xs uppercase tracking-wide text-slate-500">Variants</h2>
        {product.variants.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full max-w-xl border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-4 font-medium">Name</th>
                  <th className="py-2 pr-4 font-medium">SKU</th>
                  <th className="py-2 pr-4 font-medium">Price</th>
                  <th className="py-2 pr-4 font-medium">Stock</th>
                </tr>
              </thead>
              <tbody>
                {product.variants.map((variant, index) => (
                  <tr key={index} className="border-b border-slate-100">
                    <td className="py-2 pr-4 font-medium text-slate-800">{variant.name}</td>
                    <td className="py-2 pr-4 text-slate-500">{variant.sku || '—'}</td>
                    <td className="py-2 pr-4 tabular-nums text-slate-700">
                      {variant.priceAmount === null
                        ? formatPrice(product.priceAmount, product.currency)
                        : formatPrice(variant.priceAmount, product.currency)}
                    </td>
                    <td className="py-2 pr-4 tabular-nums text-slate-700">{variant.stock}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-slate-400">No variants.</p>
        )}
      </section>

      <p className="text-xs text-slate-400">Added {formatDate(product.createdAt)}.</p>
    </div>
  );
}
