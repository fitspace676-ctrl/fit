import type { Metadata } from 'next';
import Link from 'next/link';
import * as stylex from '@stylexjs/stylex';
import {
  Permission,
  listAdminProductsQuerySchema,
  roleHasPermission,
  type ListAdminProductsQuery,
} from '@fit/types';
import { getServerSession } from '@/lib/session';
import { ApiError, fetchProducts } from '@/lib/api';
import { Card } from '@astryxdesign/core/Card';
import { Icon } from '@/components/ui';
import { PaymentsTabs } from '@/components/payments-tabs';
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
  primaryLink: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0.5rem',
    height: '2.75rem',
    paddingInline: '1.25rem',
    borderRadius: 'var(--radius-element)',
    backgroundColor: 'var(--color-accent)',
    color: 'var(--color-on-accent)',
    fontSize: '0.875rem',
    fontWeight: 600,
    textDecoration: 'none',
  },
  addIcon: {
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
});

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/**
 * The shop catalog (T4.5), rebuilt on Astryx + brand-tokened StyleX (T11.22).
 * Server-renders one filtered, server-paginated page of `GET /admin/products` from
 * the URL search params: the whole-set summary tiles (product / active / low-stock /
 * out-of-stock counts), a segmented status tab row, the search + sort bar, and the
 * product grid with a stock badge per card. The `/payments/products` route already requires
 * staff (middleware) and the API enforces `ProductRead`, so the only failure handled
 * here is the API call itself — the tiles / grid only render on success, while the
 * URL-derived tabs and filter bar stay visible either way.
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
      <Card role="alert" variant="default" padding={0} xstyle={styles.errorCard}>
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
            watch stock at a glance — open a product to edit its gallery and variants, or add a new
            one.
          </p>
        </div>
        <div {...stylex.props(styles.headActions)}>
          <Link href="/payments/products/low-stock" {...stylex.props(styles.outlineLink)}>
            Low stock
          </Link>
          {canWrite ? (
            <Link href="/payments/products/new" {...stylex.props(styles.primaryLink)}>
              <Icon name="plus" sw={2} {...stylex.props(styles.addIcon)} />
              New product
            </Link>
          ) : null}
        </div>
      </header>

      <PaymentsTabs />

      {summary}

      <ProductsStatusTabs status={query.status ?? ''} />

      <ProductsFilters search={query.search ?? ''} sort={query.sort} dir={query.dir} />

      {content}
    </div>
  );
}
