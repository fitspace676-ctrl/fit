import type { Metadata } from 'next';
import { Card } from '@fit/ui-kit';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAdminProductsQuerySchema,
  roleHasPermission,
  type ListAdminProductsQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProductCategories, fetchProducts } from '@/lib/api';
import { fetchActiveLocations, getActiveLocationId } from '@/lib/active-location-server';
import { Icon } from '@/components/ui';
import { ProductsFilters } from './products-filters';
import { ProductsStatusTabs } from './products-status-tabs';
import { ProductsSummary } from './products-summary';
import { ProductsGrid } from './products-grid';
import { AddProductDrawer } from './add-product-drawer';
import { CategoriesDrawer } from './categories-drawer';

export const metadata: Metadata = {
  title: 'Shop - FormaCore Admin',
  description:
    'The gym’s retail catalog: a product grid with stock badges and low-stock surfacing. Search, filter by status, sort, open a product, or add one with an image gallery and variants.',
};

// The catalog reflects live tenant state and the staff session token, so it must
// never be statically rendered or cached.
export const dynamic = 'force-dynamic';

const styles = stylex.create({
  page: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1.5rem',
  },
  header: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '1rem',
  },
  headTitles: {
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
    maxWidth: '42rem',
    fontSize: '0.875rem',
    color: 'var(--color-text-secondary)',
  },
  headActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '0.75rem',
  },
  outlineLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-border)',
    backgroundColor: {
      default: 'var(--color-background-surface)',
      ':hover': 'var(--color-background-muted)',
    },
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
    color: 'var(--color-text-primary)',
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
  scope: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: '0.5rem',
    margin: 0,
    fontSize: '0.8125rem',
    color: 'var(--color-text-secondary)',
  },
  scopeLabel: {
    fontSize: '0.6875rem',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
  },
  scopeValue: {
    fontWeight: 600,
    color: 'var(--color-text-primary)',
  },
  scopeCaveat: {
    paddingInline: '0.5rem',
    paddingBlock: '0.125rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-background-muted)',
  },
  scopeLink: {
    color: 'var(--color-text-accent)',
    textDecoration: 'none',
  },
});

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The shop catalog (T4.5), rebuilt on Astryx + brand-tokened StyleX (T11.22).
 * Server-renders one filtered, server-paginated page of `GET /admin/products` from
 * the URL search params: the whole-set summary tiles (product / active / low-stock /
 * out-of-stock counts), a segmented status tab row, the search + sort bar, and the
 * product grid with a stock badge per card. The `/shop` route already requires
 * staff (middleware) and the API enforces `ProductRead`, so the only failure handled
 * here is the API call itself — the tiles / grid only render on success, while the
 * URL-derived tabs and filter bar stay visible either way.
 *
 * ## The catalogue does not narrow by branch. The stock on it does not either.
 *
 * `listAdminProductsQuerySchema` carries no `locationId`, deliberately: what the
 * gym SELLS is one list, the same at every door. Branch-exclusive products are
 * Stage 7 of multi-branch, and inventing the filter here — by, say, hiding products
 * with no stock at the selected branch — would answer a question about stock with a
 * change to the catalogue.
 *
 * The trap that leaves is the stock badge. `totalStock` / `lowestStock` are
 * roll-ups across every branch, and a card reading "In stock · 12" beside a header
 * that says "Riverside" invites exactly one reading, which is the wrong one. The
 * numbers are not changed to suit the filter and they are not hidden either —
 * either would be a different lie — so the page states the scope instead, and
 * points at `/shop/inventory`, which is the surface that does narrow.
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

  const [locationId, locations] = await Promise.all([
    getActiveLocationId(raw),
    fetchActiveLocations(),
  ]);
  const branchName = locationId
    ? (locations.find((location) => location.id === locationId)?.name ?? locationId)
    : null;

  // "New product" and category management are `ProductWrite` capabilities — shown
  // only to staff who hold them.
  const session = await getServerSession();
  const canWrite = session !== null && roleHasPermission(session.role, Permission.ProductWrite);

  // The shelves feed three things: the filter, the "New product" picker, and the
  // manager. Fetched once here rather than by each. A failure degrades to no
  // categories — the roster itself still renders, and its own error path owns that.
  const categories = await fetchProductCategories()
    .then((result) => result.data)
    .catch(() => []);

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
        categories={categories}
        canWrite={canWrite}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load products (${error.status}): ${error.message}`
        : 'Could not reach the FormaCore API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = (
      <Card role="alert" padding="none" xstyle={styles.errorCard}>
        <Icon name="info" {...stylex.props(styles.errorIcon)} />
        <span>{message}</span>
      </Card>
    );
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <div {...stylex.props(styles.headTitles)}>
          <h1 {...stylex.props(styles.title)}>Shop</h1>
          <p {...stylex.props(styles.subtitle)}>
            Your gym’s retail catalog. Search by name or description, filter by status, sort, and
            watch stock at a glance - open a product to edit its gallery and variants, or add a new
            one.
          </p>
          {branchName === null ? null : (
            <p {...stylex.props(styles.scope)}>
              <span {...stylex.props(styles.scopeLabel)}>Location</span>
              <span {...stylex.props(styles.scopeValue)}>{branchName}</span>
              <span {...stylex.props(styles.scopeCaveat)}>
                The catalogue is gym-wide, and so are the stock figures on it —{' '}
                <Link href="/shop/inventory" {...stylex.props(styles.scopeLink)}>
                  Inventory
                </Link>{' '}
                has {branchName}’s shelves
              </span>
            </p>
          )}
        </div>
        <div {...stylex.props(styles.headActions)}>
          <Link href="/shop/inventory" {...stylex.props(styles.outlineLink)}>
            Inventory
          </Link>
          <Link href="/shop/low-stock" {...stylex.props(styles.outlineLink)}>
            Low stock
          </Link>
          {canWrite ? <CategoriesDrawer categories={categories} /> : null}
          {canWrite ? <AddProductDrawer categories={categories} /> : null}
        </div>
      </header>

      {summary}

      <ProductsStatusTabs status={query.status ?? ''} />

      <ProductsFilters
        search={query.search ?? ''}
        sort={query.sort}
        dir={query.dir}
        categoryId={query.categoryId ?? ''}
        categories={categories}
      />

      {content}
    </div>
  );
}
