import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProduct } from '@/lib/api';
import { ProductForm } from '../../product-form';

export const metadata: Metadata = {
  title: 'Edit product — Fit Admin',
};

// Reflects the staff session and writes live product state — never cached.
export const dynamic = 'force-dynamic';

/**
 * Edit-a-product page (T4.6). Like {@link NewProductPage} it gates on the
 * `ProductWrite` capability (not linear by role) before rendering, and reuses the
 * shared {@link ProductForm} prefilled from `GET /admin/products/:id`. A `404` from
 * the API — unknown or cross-tenant id — becomes Next's `notFound()`.
 */
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ProductWrite)) {
    redirect('/403');
  }

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

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/products/${id}`}
        className="text-sm font-medium text-brand-700 hover:text-brand-800"
      >
        ← Back to product
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Edit product</h1>
        <p className="text-sm text-slate-500">
          Update {product.name}’s details, price, images, and variants.
        </p>
      </header>

      <ProductForm
        mode="edit"
        productId={id}
        initial={{
          name: product.name,
          description: product.description,
          priceAmount: product.priceAmount,
          currency: product.currency,
          images: product.images,
          variants: product.variants,
        }}
      />
    </div>
  );
}
