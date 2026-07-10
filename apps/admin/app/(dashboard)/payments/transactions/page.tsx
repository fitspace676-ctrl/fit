import type { Metadata } from 'next';
import * as stylex from '@stylexjs/stylex';
import { listOrdersQuerySchema, type ListOrdersQueryInput } from '@fit/types';
import { ApiError, fetchOrders, ordersQueryString } from '@/lib/api';
import { PaymentsTabs } from '@/components/payments-tabs';
import { OrdersFilters } from './orders-filters';
import { OrdersStatusTabs } from './orders-status-tabs';
import { OrdersSummary } from './orders-summary';
import { OrdersTable } from './orders-table';

export const metadata: Metadata = {
  title: 'Orders — Fit Admin',
  description:
    'The gym’s orders across POS and online channels: filter by channel, status, member, and date, open an order, issue a refund, or export to CSV.',
};

// The roster reflects live tenant state and the staff session token, so it must
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
  errorText: {
    margin: 0,
    borderRadius: 'var(--radius-element)',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: 'var(--color-error)',
    backgroundColor: 'var(--color-error-muted)',
    paddingInline: '1rem',
    paddingBlock: '0.75rem',
    fontSize: '0.875rem',
    color: 'var(--color-error)',
  },
});

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** Collapse a raw search param to a single string (first value of an array). */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The orders roster (T7.9), rebuilt on Astryx + brand-tokened StyleX (T11.22).
 * Server-renders one filtered, server-paginated page of `GET /orders` from the
 * URL search params and hands it to the client filters (channel / status /
 * member / date range) and the client table (pagination + CSV export link). The
 * `/payments/transactions` route already requires staff with `BillingRead` (middleware + nav
 * gate) and the API re-enforces it, so the only failure handled here is the API
 * call itself.
 */
export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const parsed = listOrdersQuerySchema.safeParse(raw);
  const query = parsed.success ? parsed.data : listOrdersQuerySchema.parse({});

  // The filters the table's export link and pager carry forward — the raw,
  // pre-coercion values straight off the URL so they round-trip unchanged.
  const filters: Partial<ListOrdersQueryInput> = {
    channel: one(raw.channel) as ListOrdersQueryInput['channel'],
    status: one(raw.status) as ListOrdersQueryInput['status'],
    memberId: one(raw.memberId),
    from: one(raw.from),
    to: one(raw.to),
  };

  let content;
  // The summary tiles ("totals") reflect the whole filtered set, so they only
  // render on a successful fetch; the tabs + filter bar are static (URL-derived)
  // and stay visible even when the API call fails.
  let summary = null;
  try {
    // Send the raw string filters (not the coerced query, whose dates are `Date`
    // objects) plus the validated page/limit; the API re-coerces and re-validates.
    const result = await fetchOrders({ ...filters, page: query.page, limit: query.limit });
    summary = <OrdersSummary summary={result.summary} />;
    content = (
      <OrdersTable
        orders={result.data}
        total={result.total}
        page={result.page}
        limit={result.limit}
        exportQuery={ordersQueryString(filters)}
      />
    );
  } catch (error) {
    const message =
      error instanceof ApiError
        ? `Could not load orders (${error.status}): ${error.message}`
        : 'Could not reach the Fit API. Check NEXT_PUBLIC_API_URL and that the API is running.';
    content = <p {...stylex.props(styles.errorText)}>{message}</p>;
  }

  return (
    <div {...stylex.props(styles.page)}>
      <header {...stylex.props(styles.header)}>
        <h1 {...stylex.props(styles.title)}>Orders</h1>
        <p {...stylex.props(styles.subtitle)}>
          POS and online orders. Filter, open an order to view its items, payments, refunds and
          status history, or export the filtered set to CSV.
        </p>
      </header>

      <PaymentsTabs />

      {summary}

      <OrdersStatusTabs status={filters.status ?? ''} />

      <OrdersFilters
        channel={filters.channel ?? ''}
        memberId={filters.memberId ?? ''}
        from={filters.from ?? ''}
        to={filters.to ?? ''}
      />

      {content}
    </div>
  );
}
