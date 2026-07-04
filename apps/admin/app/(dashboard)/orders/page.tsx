import type { Metadata } from 'next';
import { listOrdersQuerySchema, type ListOrdersQueryInput } from '@fit/types';
import { ApiError, fetchOrders, ordersQueryString } from '@/lib/api';
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

/** Next 15 hands `searchParams` as a promise of raw (string | string[]) values. */
type SearchParams = Record<string, string | string[] | undefined>;

/** Collapse a raw search param to a single string (first value of an array). */
function one(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * The orders roster (T7.9). Server-renders one filtered, server-paginated page of
 * `GET /orders` from the URL search params and hands it to the client filters
 * (channel / status / member / date range) and the client table (pagination +
 * CSV export link). The `/orders` route already requires staff with `BillingRead`
 * (middleware + nav gate) and the API re-enforces it, so the only failure handled
 * here is the API call itself.
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
    content = (
      <p className="rounded-card border border-danger-500/30 bg-danger-500/10 px-4 py-3 text-sm text-danger-700 dark:text-danger-300">
        {message}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-ink-900 dark:text-white sm:text-3xl">
          Orders
        </h1>
        <p className="text-sm text-ink-500 dark:text-ink-400">
          POS and online orders. Filter, open an order to view its items, payments, refunds and
          status history, or export the filtered set to CSV.
        </p>
      </header>

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
