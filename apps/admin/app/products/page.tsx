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
import { ProductsFilters } from './products-filters';
import { ProductsTable } from './products-table';

export const metadata: Metadata = {
  title: 'Products — Fit Admin',
  description:
    'The gym’s retail products: search, filter, sort, open a product, add or edit products with an image gallery and variants.',
};

// The roster reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The products roster (T4.6). Server-renders one filtered, server-paginated page
 * of `GET /admin/products` from the URL search params and hands it to the client
 * table (sort links) and the client filters (search + status). The `/products`
 * route already requires staff (middleware) and the API enforces `ProductRead`, so
 * the only failure handled here is the API call itself.
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

  let content;
  try {
    const result = await fetchProducts(query);
    content = (
      <ProductsTable
        products={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        sort={query.sort}
        dir={query.dir}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load products (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <p role="alert" className="rounded-card bg-red-50 px-3 py-2 text-sm text-red-700">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Products</h1>
          <p className="max-w-2xl text-sm text-slate-500">
            Your gym’s retail products. Search by name or description, filter by status, sort any
            column, open a product, or add a new one with an image gallery and variants.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/products/low-stock"
            className="rounded-card border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Low stock
          </Link>
          {canWrite ? (
            <Link
              href="/products/new"
              className="rounded-card bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
            >
              New product
            </Link>
          ) : null}
        </div>
      </header>

      <ProductsFilters search={query.search ?? ''} status={query.status ?? ''} />

      {content}
    </div>
  );
}
