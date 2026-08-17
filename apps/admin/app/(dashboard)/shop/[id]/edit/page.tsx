import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import * as stylex from '@stylexjs/stylex';
import { Permission, roleHasPermission, type ListAdminProductCategoriesResponse } from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProduct, fetchProductCategories } from '@/lib/api';
import { Icon } from '@/components/ui';
import { ProductForm } from '../../product-form';

export const metadata: Metadata = {
  title: 'Edit product - Fit Admin',
};

// Reflects the staff session and writes live product state — never cached.
export const dynamic = 'force-dynamic';

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
    flexDirection: 'column',
    gap: '0.25rem',
  },
  title: {
    margin: 0,
    fontFamily: 'var(--font-family-heading)',
    fontSize: 'clamp(1.5rem, 4vw, 1.875rem)',
    fontWeight: 800,
    letterSpacing: '-0.02em',
    color: 'var(--color-text-primary)',
  },
  subtitle: {
    margin: 0,
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
});

/**
 * Edit-a-product page (T4.6), rebuilt on brand-tokened StyleX (T11.22). Like
 * {@link NewProductPage} it gates on the `ProductWrite` capability (not linear by
 * role) before rendering, and reuses the shared {@link ProductForm} prefilled from
 * `GET /admin/products/:id`. A `404` from the API — unknown or cross-tenant id —
 * becomes Next's `notFound()`.
 */
export default async function EditProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const session = await getServerSession();
  if (!session || !roleHasPermission(session.role, Permission.ProductWrite)) {
    redirect('/403');
  }

  let product;
  let categories: ListAdminProductCategoriesResponse = { data: [] };
  try {
    // The picker needs the gym's shelves alongside the product. A category-list
    // failure shouldn't block editing, so it degrades to an empty picker below.
    [product, categories] = await Promise.all([
      fetchProduct(id),
      fetchProductCategories().catch(() => ({ data: [] })),
    ]);
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
        <Link href="/shop" {...stylex.props(styles.backLink)}>
          <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
          Back to products
        </Link>
        <Card role="alert" padding="none" xstyle={styles.errorCard}>
          <Icon name="info" {...stylex.props(styles.errorIcon)} />
          <span>{message}</span>
        </Card>
      </div>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <Link href={`/shop/${id}`} {...stylex.props(styles.backLink)}>
        <Icon name="arrowLeft" sw={2} {...stylex.props(styles.backIcon)} />
        Back to product
      </Link>

      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Edit product</h1>
        <p {...stylex.props(styles.subtitle)}>
          Update {product.name}’s details, price, images, and variants.
        </p>
      </header>

      <ProductForm
        mode="edit"
        productId={id}
        categories={categories.data}
        initial={{
          name: product.name,
          description: product.description,
          priceAmount: product.priceAmount,
          costAmount: product.costAmount,
          currency: product.currency,
          images: product.images,
          variants: product.variants,
          stock: product.stock,
          lowStockThreshold: product.lowStockThreshold,
          categoryId: product.category?.id ?? null,
        }}
      />
    </div>
  );
}
