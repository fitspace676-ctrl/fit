import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { Permission, roleHasPermission } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProduct } from '@/lib/api';
import { Card, Icon } from '@/components/ui';
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

  return (
    <div className="flex flex-col gap-6">
      <Link
        href={`/products/${id}`}
        className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:text-brand-800 dark:text-brand-300 dark:hover:text-brand-200"
      >
        <Icon name="arrowLeft" className="h-4 w-4" sw={2} />
        Back to product
      </Link>

      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Edit product
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
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
