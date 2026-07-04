import type { Metadata } from 'next';
import Link from 'next/link';
import {
  Permission,
  listAdminProductsQuerySchema,
  roleHasPermission,
  type ListAdminProductsQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProducts } from '@/lib/api';
import { Card, Icon, buttonClasses } from '@/components/ui';
import { ProductsFilters } from './products-filters';
import { ProductsStatusTabs } from './products-status-tabs';
import { ProductsSummary } from './products-summary';
import { ProductsGrid } from './products-grid';

export const metadata: Metadata = {
  title: 'Shop — Fit Admin',
  description:
    'The gym’s retail catalog: a product grid with stock badges and low-stock surfacing. Search, filter by status, sort, open a product, or add one with an image gallery and variants.',
};

// The catalog reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The shop catalog (T4.5). Server-renders one filtered, server-paginated page of
 * `GET /admin/products` from the URL search params to the formacore shop artboard:
 * the whole-set summary tiles (product / active / low-stock / out-of-stock counts),
 * a segmented status tab row, the search + sort bar, and the product grid with a
 * stock badge per card. The `/products` route already requires staff (middleware)
 * and the API enforces `ProductRead`, so the only failure handled here is the API
 * call itself — the tiles / grid only render on success, while the URL-derived tabs
 * and filter bar stay visible either way.
 */
export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listAdminProductsQuerySchema.safeParse(raw);
  const query: ListAdminProductsQuery = parsed.success
    ? parsed.data
    : listAdminProductsQuerySchema.parse({});

  // "New product" is a `ProductWrite` capability — shown only to staff who hold it.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  let summary = null;
  let content;
  try {
    const result = await fetchProducts(query);
    summary = <ProductsSummary summary={result.summary} />;
    content = (
      <ProductsGrid
        products={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load products (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card
        role="alert"
        className="flex items-center gap-3 p-4 text-sm text-danger-700 dark:text-danger-300"
      >
        <Icon name="info" className="h-5 w-5 shrink-0" />
        <span>{message}</span>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
            Shop
          </h1>
          <p className="max-w-2xl text-sm text-ink-500 dark:text-ink-400">
            Your gym’s retail catalog. Search by name or description, filter by status, sort, and
            watch stock at a glance — open a product to edit its gallery and variants, or add a new
            one.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/products/low-stock" className={buttonClasses('outline', 'md')}>
            Low stock
          </Link>
          {canWrite ? (
            <Link href="/products/new" className={buttonClasses('primary', 'md')}>
              <Icon name="plus" className="h-4 w-4" sw={2} />
              New product
            </Link>
          ) : null}
        </div>
      </header>

      {summary}

      <ProductsStatusTabs status={query.status ?? ''} />

      <ProductsFilters search={query.search ?? ''} sort={query.sort} dir={query.dir} />

      {content}
    </div>
  );
}
